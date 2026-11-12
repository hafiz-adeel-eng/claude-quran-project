// syscap - capture the Mac's SYSTEM audio (what the other person says in Meet or
// Zoom) and stream it to stdout as raw PCM for the Python engine.
//
// Why this exists: on Windows the engine opens a WASAPI "loopback" of the
// speakers. macOS has no such loopback. The usual workaround is a virtual audio
// driver (BlackHole) plus a Multi-Output Device, which means installing a kernel
// extension and rewiring how the user hears every call. ScreenCaptureKit
// (macOS 13+) can hand us the system audio mix directly, with nothing installed.
//
// Wire format on stdout:
//   8-byte header, written once before any audio:
//       "SCAP" (4 ASCII bytes) + sample rate (UInt32, little-endian)
//   then an endless stream of mono Float32 little-endian samples.
//
// Status and errors go to stderr as single lines starting with "syscap:".
//
// Needs the Screen Recording permission (System Settings > Privacy & Security >
// Screen & System Audio Recording) for whichever app launched it.
//
// Build:  swiftc -O -o syscap syscap.swift

import Foundation
import ScreenCaptureKit
import CoreMedia
import AVFoundation
import CoreAudio

setvbuf(stdout, nil, _IONBF, 0)

func log(_ s: String) {
    FileHandle.standardError.write(("syscap: " + s + "\n").data(using: .utf8)!)
}

final class Capturer: NSObject, SCStreamOutput, SCStreamDelegate {
    private var stream: SCStream?
    private var wroteHeader = false
    private let out = FileHandle.standardOutput
    private let queue = DispatchQueue(label: "syscap.audio")

    func start() async throws {
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        guard let display = content.displays.first else {
            throw NSError(domain: "syscap", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "no display available"])
        }

        // We only want the AUDIO. A video configuration is mandatory, so make it
        // as close to free as the API allows: a tiny frame, once a second.
        let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
        let cfg = SCStreamConfiguration()
        cfg.capturesAudio = true
        cfg.excludesCurrentProcessAudio = true
        cfg.sampleRate = 16000
        cfg.channelCount = 1
        cfg.width = 2
        cfg.height = 2
        cfg.minimumFrameInterval = CMTime(value: 1, timescale: 1)
        cfg.queueDepth = 3
        cfg.showsCursor = false

        let s = SCStream(filter: filter, configuration: cfg, delegate: self)
        try s.addStreamOutput(self, type: .audio, sampleHandlerQueue: queue)
        // Swallow the video frames we are forced to receive.
        try s.addStreamOutput(self, type: .screen, sampleHandlerQueue: DispatchQueue(label: "syscap.video"))
        try await s.startCapture()
        stream = s
        log("started display=\(display.displayID)")
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio, sb.isValid else { return }
        guard let fmt = CMSampleBufferGetFormatDescription(sb),
              let asbdPtr = CMAudioFormatDescriptionGetStreamBasicDescription(fmt) else { return }
        let asbd = asbdPtr.pointee
        let frames = CMSampleBufferGetNumSamples(sb)
        if frames <= 0 { return }

        var needed = 0
        CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
            sb, bufferListSizeNeededOut: &needed, bufferListOut: nil, bufferListSize: 0,
            blockBufferAllocator: nil, blockBufferMemoryAllocator: nil, flags: 0, blockBufferOut: nil)
        if needed <= 0 { return }

        let raw = UnsafeMutableRawPointer.allocate(byteCount: needed,
                                                   alignment: MemoryLayout<AudioBufferList>.alignment)
        defer { raw.deallocate() }
        let ablPtr = raw.assumingMemoryBound(to: AudioBufferList.self)
        var block: CMBlockBuffer?
        let st = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
            sb, bufferListSizeNeededOut: nil, bufferListOut: ablPtr, bufferListSize: needed,
            blockBufferAllocator: nil, blockBufferMemoryAllocator: nil,
            flags: kCMSampleBufferFlag_AudioBufferList_Assure16ByteAlignment, blockBufferOut: &block)
        if st != noErr { return }

        let abl = UnsafeMutableAudioBufferListPointer(ablPtr)
        let channels = max(1, Int(asbd.mChannelsPerFrame))
        let isFloat = (asbd.mFormatFlags & kAudioFormatFlagIsFloat) != 0
        let nonInterleaved = (asbd.mFormatFlags & kAudioFormatFlagIsNonInterleaved) != 0

        // Downmix whatever arrives to mono Float32.
        var mono = [Float](repeating: 0, count: frames)
        if isFloat {
            if nonInterleaved {
                let n = min(abl.count, channels)
                for c in 0..<n {
                    guard let p = abl[c].mData?.assumingMemoryBound(to: Float.self) else { continue }
                    for i in 0..<frames { mono[i] += p[i] }
                }
                if n > 1 { for i in 0..<frames { mono[i] /= Float(n) } }
            } else if let p = abl[0].mData?.assumingMemoryBound(to: Float.self) {
                for i in 0..<frames {
                    var acc: Float = 0
                    for c in 0..<channels { acc += p[i * channels + c] }
                    mono[i] = acc / Float(channels)
                }
            }
        } else if asbd.mBitsPerChannel == 16, let p = abl[0].mData?.assumingMemoryBound(to: Int16.self) {
            for i in 0..<frames {
                var acc: Float = 0
                for c in 0..<channels { acc += Float(p[i * channels + c]) / 32768.0 }
                mono[i] = acc / Float(channels)
            }
        } else {
            return
        }

        if !wroteHeader {
            var header = Data("SCAP".utf8)
            var rate = UInt32(asbd.mSampleRate).littleEndian
            header.append(Data(bytes: &rate, count: 4))
            out.write(header)
            wroteHeader = true
            log("format rate=\(Int(asbd.mSampleRate)) ch=\(channels) float=\(isFloat) nonInterleaved=\(nonInterleaved)")
        }
        mono.withUnsafeBufferPointer { out.write(Data(buffer: $0)) }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        log("stopped: \(error.localizedDescription)")
        exit(2)
    }
}

// `syscap --devices` prints the CURRENT default input/output names and every
// device name as one JSON line, then exits. The engine polls this to notice
// headphone / AirPods switches: PortAudio caches the device list at startup
// and cannot be re-scanned while streams are open, CoreAudio can.
func deviceName(_ id: AudioObjectID) -> String? {
    var addr = AudioObjectPropertyAddress(mSelector: kAudioObjectPropertyName,
                                          mScope: kAudioObjectPropertyScopeGlobal,
                                          mElement: kAudioObjectPropertyElementMain)
    var name: Unmanaged<CFString>?
    var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
    guard AudioObjectGetPropertyData(id, &addr, 0, nil, &size, &name) == noErr,
          let n = name?.takeRetainedValue() else { return nil }
    return n as String
}

func defaultDevice(_ selector: AudioObjectPropertySelector) -> String? {
    var addr = AudioObjectPropertyAddress(mSelector: selector,
                                          mScope: kAudioObjectPropertyScopeGlobal,
                                          mElement: kAudioObjectPropertyElementMain)
    var id = AudioObjectID(0)
    var size = UInt32(MemoryLayout<AudioObjectID>.size)
    guard AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size, &id) == noErr,
          id != 0 else { return nil }
    return deviceName(id)
}

func allDevices() -> [String] {
    var addr = AudioObjectPropertyAddress(mSelector: kAudioHardwarePropertyDevices,
                                          mScope: kAudioObjectPropertyScopeGlobal,
                                          mElement: kAudioObjectPropertyElementMain)
    var size: UInt32 = 0
    let sys = AudioObjectID(kAudioObjectSystemObject)
    guard AudioObjectGetPropertyDataSize(sys, &addr, 0, nil, &size) == noErr else { return [] }
    var ids = [AudioObjectID](repeating: 0, count: Int(size) / MemoryLayout<AudioObjectID>.size)
    guard AudioObjectGetPropertyData(sys, &addr, 0, nil, &size, &ids) == noErr else { return [] }
    return ids.compactMap(deviceName).sorted()
}

if CommandLine.arguments.contains("--devices") {
    let obj: [String: Any] = [
        "output": defaultDevice(kAudioHardwarePropertyDefaultOutputDevice) ?? NSNull(),
        "input": defaultDevice(kAudioHardwarePropertyDefaultInputDevice) ?? NSNull(),
        "all": allDevices(),
    ]
    let data = try! JSONSerialization.data(withJSONObject: obj)
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write("\n".data(using: .utf8)!)
    exit(0)
}

let cap = Capturer()
signal(SIGTERM) { _ in exit(0) }
signal(SIGINT) { _ in exit(0) }
signal(SIGPIPE) { _ in exit(0) }   // the engine went away

Task {
    do {
        try await cap.start()
    } catch {
        let msg = error.localizedDescription
        if msg.lowercased().contains("permission") || msg.lowercased().contains("declined")
            || msg.lowercased().contains("not authorized") || msg.lowercased().contains("tcc") {
            log("PERMISSION: \(msg)")
            exit(3)
        }
        log("ERROR: \(msg)")
        exit(1)
    }
}
RunLoop.main.run()
