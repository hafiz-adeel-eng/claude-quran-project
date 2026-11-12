"""
Standalone device listing and testing, for the dashboard.

Separate from engine.py on purpose: you want to pick and test your headset
BEFORE starting a meeting, and the engine only runs during one. This opens the
devices itself, does the test, prints one line of JSON, and exits.

  py -3.11 audio/devtest.py --list
  py -3.11 audio/devtest.py --test-speaker [--output "NAME"]
  py -3.11 audio/devtest.py --test-mic [--input "NAME"] [--output "NAME"] [--seconds 4]

The speaker test does something Zoom's does not: it also reports what the
LOOPBACK captured. That is the path the whole app depends on -- if a tone plays
but the loopback hears nothing, the other person will never be transcribed.
"""

import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
if sys.platform == "darwin":
    import mac_pa as pa          # same API, Core Audio + ScreenCaptureKit
else:
    import pyaudiowpatch as pa

import devices
from capture import CaptureSource

SR = 16000


def out(obj):
    print(json.dumps(obj), flush=True)


def pick_output(p, name):
    return (devices.find_by_name(p, name, True) if name else None) or devices.default_output(p)


def pick_input(p, name):
    return (devices.find_by_name(p, name, False) if name else None) or devices.default_input(p)


def play(p, pcm16k, dev, gain=1.0):
    sr = int(dev["defaultSampleRate"])
    ch = max(1, min(2, int(dev["maxOutputChannels"])))
    n = int(len(pcm16k) * sr / SR)
    idx = np.clip((np.arange(n) * SR / sr).astype(np.int64), 0, len(pcm16k) - 1)
    sig = (pcm16k[idx] * gain).astype(np.float32)
    st = p.open(format=pa.paFloat32, channels=ch, rate=sr, output=True,
                output_device_index=dev["index"], frames_per_buffer=1024)
    try:
        for i in range(0, len(sig), 1024):
            c = sig[i:i + 1024]
            st.write(np.repeat(c, ch).astype(np.float32).tobytes())
    finally:
        st.stop_stream()
        st.close()


def record(p, dev, seconds, keepalive_dev=None):
    """
    Capture `seconds` from an input (or loopback) device as 16 kHz mono.

    Uses the app's own CaptureSource rather than opening a raw stream, because a
    loopback endpoint that is sitting idle refuses to start (-9999) without the
    silent keep-alive stream CaptureSource sets up. That also means this test
    exercises the exact code path a real meeting uses.
    """
    frames = []
    src = CaptureSource(p, "test", lambda role, pcm: frames.append(pcm.copy()))
    src.open(dev, keepalive_dev=keepalive_dev)
    try:
        time.sleep(seconds)
    finally:
        src.close()
    return np.concatenate(frames) if frames else np.zeros(0, dtype=np.float32)


def chime():
    t = np.arange(int(SR * 1.4)) / SR
    tone = np.zeros_like(t)
    for i, f in enumerate((587.0, 880.0)):
        seg = (t >= i * 0.7) & (t < (i + 1) * 0.7)
        tone[seg] = np.sin(2 * np.pi * f * t[seg])
    env = np.minimum(1.0, np.minimum(t * 12, (t[-1] - t) * 12))
    return (0.35 * tone * env).astype(np.float32)


def levels(a):
    if not len(a):
        return 0.0, 0.0
    return float(np.max(np.abs(a))), float(np.sqrt(np.mean(a.astype(np.float64) ** 2)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--test-speaker", action="store_true")
    ap.add_argument("--test-mic", action="store_true")
    ap.add_argument("--input", default="")
    ap.add_argument("--output", default="")
    ap.add_argument("--seconds", type=float, default=4.0)
    ap.add_argument("--playback", action="store_true")
    args = ap.parse_args()

    p = pa.PyAudio()
    try:
        if args.list:
            out({"ok": True, **devices.list_all(p)})
            return

        if args.test_speaker:
            dev = pick_output(p, args.output)
            if dev is None:
                out({"ok": False, "which": "speaker", "detail": "No output device found."})
                return
            lb = devices.loopback_for(p, dev)
            if lb is None:
                out({"ok": False, "which": "speaker", "device": dev["name"],
                     "detail": "Windows exposes no loopback for this output, so meeting audio cannot be captured from it."})
                return

            # Record the loopback while the chime plays.
            # Deliberately single-threaded. Opening a WASAPI stream from a fresh
            # Python thread fails with -9999 because PortAudio needs COM
            # initialised on the calling thread. No thread is needed anyway:
            # PortAudio's own callback keeps filling `frames` while the main
            # thread is busy playing the chime.
            frames = []
            src = CaptureSource(p, "test", lambda role, pcm: frames.append(pcm.copy()))
            src.open(lb, keepalive_dev=dev)
            try:
                time.sleep(1.6)                    # Bluetooth needs ~1 s to spin up
                play(p, chime(), dev)
                time.sleep(0.6)                    # let the tail drain through
            finally:
                src.close()

            captured = np.concatenate(frames) if frames else np.zeros(0, dtype=np.float32)
            peak, rms = levels(captured)
            ok = peak > 0.01
            out({
                "ok": ok, "which": "speaker", "device": dev["name"], "loopback": lb["name"],
                "peak": round(peak, 4), "rms": round(rms, 5),
                "detail": ("Tone played and the loopback heard it. Meeting audio will be transcribed."
                           if ok else
                           "Tone played but the loopback heard nothing. Make sure this is the device your "
                           "meeting actually plays through, and that it is not muted."),
            })
            return

        if args.test_mic:
            dev = pick_input(p, args.input)
            if dev is None:
                out({"ok": False, "which": "mic", "detail": "No microphone found."})
                return
            a = record(p, dev, args.seconds)
            peak, rms = levels(a)
            ok = peak > 0.02

            if ok and args.playback:
                odev = pick_output(p, args.output)
                if odev is not None:
                    play(p, a / max(peak, 1e-6) * 0.5, odev)

            out({
                "ok": ok, "which": "mic", "device": dev["name"],
                "peak": round(peak, 4), "rms": round(rms, 5),
                "seconds": round(len(a) / SR, 1),
                "detail": ("Heard you clearly." if peak > 0.08 else
                           "Heard you, but quietly - move closer or raise the mic level." if ok else
                           "Heard nothing. Check the microphone is the right one and not muted."),
            })
            return

        out({"ok": False, "detail": "Nothing to do. Pass --list, --test-speaker or --test-mic."})
    except Exception as e:
        out({"ok": False, "detail": str(e)})
    finally:
        p.terminate()


if __name__ == "__main__":
    main()
