"""
One audio source -> a clean 16 kHz mono float32 stream.

Two roles:
  THEM -> WASAPI loopback of the current output device (what the other person says)
  ME   -> the current default microphone (what you say)

Two details that make or break this:

1. Keep-alive. A WASAPI loopback endpoint delivers ZERO callbacks while nothing
   is playing -- Windows parks the audio engine. The stream then takes a moment
   to spin up when sound starts, and the first word of a sentence is lost. We
   hold a silent output stream open on the same endpoint so the engine stays
   hot and frames flow continuously. (Measured: 0 frames idle -> 46 frames/sec
   with keep-alive.)

2. The PortAudio callback does nothing but copy bytes into a queue. All DSP
   happens on a worker thread. On a 2-core machine, numpy work inside the
   audio callback causes dropouts.
"""

import queue
import threading
import time

import numpy as np
import sys

if sys.platform == "darwin":
    import mac_pa as pa          # same API, Core Audio + ScreenCaptureKit
else:
    import pyaudiowpatch as pa

from resampler import StreamResampler, to_mono, TARGET_SR

BLOCK = 1024


class CaptureSource:
    def __init__(self, p, role, on_audio, on_status=None):
        self.p = p
        self.role = role                 # 'them' | 'me'
        self.on_audio = on_audio         # fn(role, float32 mono @16k)
        self.on_status = on_status or (lambda *a, **k: None)

        self._stream = None
        self._keepalive = None
        self._q = queue.Queue(maxsize=256)
        self._worker = None
        self._stop = threading.Event()

        self.device_name = None
        self.sr = None
        self.channels = None
        self.level = 0.0                 # rolling RMS, for the UI meter
        self.last_frame_at = 0.0
        self.frames_seen = 0

    # ---------- lifecycle ----------

    def open(self, dev, keepalive_dev=None):
        self.close()
        self._stop.clear()

        self.device_name = dev["name"]
        self.sr = int(dev["defaultSampleRate"])
        self.channels = max(1, min(2, int(dev["maxInputChannels"])))
        self._resampler = StreamResampler(self.sr, TARGET_SR)

        def cb(in_data, frame_count, time_info, status):
            # Fast path only: never allocate or block here.
            try:
                self._q.put_nowait(in_data)
            except queue.Full:
                try:                     # drop oldest, keep the stream real-time
                    self._q.get_nowait()
                    self._q.put_nowait(in_data)
                except Exception:
                    pass
            return (None, pa.paContinue)

        self._stream = self.p.open(
            format=pa.paFloat32,
            channels=self.channels,
            rate=self.sr,
            input=True,
            input_device_index=dev["index"],
            frames_per_buffer=BLOCK,
            stream_callback=cb,
        )
        self._stream.start_stream()

        if keepalive_dev is not None and not getattr(pa, "NO_KEEPALIVE", False):
            self._open_keepalive(keepalive_dev)

        self._worker = threading.Thread(target=self._run, name=f"cap-{self.role}", daemon=True)
        self._worker.start()

        self.on_status("open", role=self.role, device=self.device_name,
                       sr=self.sr, channels=self.channels,
                       keepalive=self._keepalive is not None)

    def _open_keepalive(self, out_dev):
        """Silent playback so the loopback endpoint never parks."""
        try:
            sr = int(out_dev["defaultSampleRate"])
            ch = max(1, min(2, int(out_dev["maxOutputChannels"])))
            silence = np.zeros(BLOCK * ch, dtype=np.float32).tobytes()

            def ocb(in_data, frame_count, time_info, status):
                if frame_count == BLOCK:
                    return (silence, pa.paContinue)
                return (np.zeros(frame_count * ch, dtype=np.float32).tobytes(), pa.paContinue)

            self._keepalive = self.p.open(
                format=pa.paFloat32, channels=ch, rate=sr, output=True,
                output_device_index=out_dev["index"], frames_per_buffer=BLOCK,
                stream_callback=ocb,
            )
            self._keepalive.start_stream()
        except Exception as e:
            # Bluetooth endpoints can refuse a second stream. Degrade, don't die:
            # we still get frames whenever real audio plays.
            self._keepalive = None
            self.on_status("keepalive_failed", role=self.role, error=str(e))

    def close(self):
        self._stop.set()
        for s in (self._stream, self._keepalive):
            try:
                if s is not None:
                    s.stop_stream()
                    s.close()
            except Exception:
                pass
        self._stream = None
        self._keepalive = None
        if self._worker and self._worker.is_alive():
            self._worker.join(timeout=1.0)
        self._worker = None
        while not self._q.empty():
            try:
                self._q.get_nowait()
            except Exception:
                break

    @property
    def alive(self):
        try:
            return self._stream is not None and self._stream.is_active()
        except Exception:
            return False

    # ---------- worker ----------

    def _run(self):
        while not self._stop.is_set():
            try:
                raw = self._q.get(timeout=0.2)
            except queue.Empty:
                continue
            try:
                mono = to_mono(raw, self.channels)
                if len(mono) == 0:
                    continue
                pcm = self._resampler.process(mono)
                if len(pcm) == 0:
                    continue

                rms = float(np.sqrt(np.mean(pcm.astype(np.float64) ** 2)))
                self.level = 0.8 * self.level + 0.2 * rms
                self.frames_seen += 1
                self.last_frame_at = time.time()

                self.on_audio(self.role, pcm)
            except Exception as e:
                self.on_status("worker_error", role=self.role, error=str(e))
