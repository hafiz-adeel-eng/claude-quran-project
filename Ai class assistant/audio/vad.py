"""
Turns a continuous 16 kHz stream into utterances.

This is where perceived latency is won or lost. Two emissions per utterance:

  PARTIAL - every ~1.5 s while someone is still talking, so text appears on the
            overlay while they speak instead of after they stop.
  FINAL   - after ~0.6 s of silence, which is what triggers Claude.

Guards:
  * pre-roll ring keeps ~400 ms of audio from BEFORE the trigger, so the first
    syllable is never clipped.
  * adaptive noise floor on top of WebRTC VAD -- WebRTC alone latches onto fan
    noise and keyboard clicks and would fire Claude at empty air.
  * long monologues are cut at max_segment_s so we can answer mid-stream
    instead of waiting for a 40-second answer to end.
"""

import collections
import time

import numpy as np
import webrtcvad

SR = 16000
FRAME_MS = 20
FRAME = SR * FRAME_MS // 1000          # 320 samples


class Segmenter:
    def __init__(self, role, on_partial, on_final, cfg=None):
        cfg = cfg or {}
        self.role = role
        self.on_partial = on_partial
        self.on_final = on_final

        self.vad = webrtcvad.Vad(int(cfg.get("aggressiveness", 2)))
        self.start_frames = int(cfg.get("start_frames", 3))                  # 60 ms of voice
        self.end_frames = int(cfg.get("end_ms", 600) // FRAME_MS)            # 600 ms of silence
        self.max_segment_s = float(cfg.get("max_segment_s", 18.0))
        self.min_segment_ms = float(cfg.get("min_segment_ms", 280))
        self.partial_every_s = float(cfg.get("partial_every_s", 1.5))
        self.preroll_frames = int(cfg.get("preroll_ms", 400) // FRAME_MS)

        self._residual = np.zeros(0, dtype=np.float32)
        self._preroll = collections.deque(maxlen=self.preroll_frames)
        self._seg = []
        self._speaking = False
        self._voiced_run = 0
        self._unvoiced_run = 0
        self._next_partial_at = 0.0
        self._seq = 0
        self._continued = False

        # Adaptive noise floor.
        self._noise = 0.0015
        self._noise_init = False

    def reset(self):
        self._residual = np.zeros(0, dtype=np.float32)
        self._preroll.clear()
        self._seg = []
        self._speaking = False
        self._voiced_run = self._unvoiced_run = 0
        self._continued = False

    def feed(self, pcm):
        if len(pcm) == 0:
            return
        buf = np.concatenate([self._residual, pcm]) if len(self._residual) else pcm
        n = (len(buf) // FRAME) * FRAME
        self._residual = buf[n:].copy()
        if n == 0:
            return
        for i in range(0, n, FRAME):
            self._frame(buf[i:i + FRAME])

    # ---------- internals ----------

    def _frame(self, f):
        rms = float(np.sqrt(np.mean(f.astype(np.float64) ** 2)))

        # WebRTC VAD wants 16-bit PCM.
        i16 = np.clip(f * 32767.0, -32768, 32767).astype(np.int16)
        try:
            vad_voice = self.vad.is_speech(i16.tobytes(), SR)
        except Exception:
            vad_voice = rms > 0.01

        # Track the noise floor only while it is quiet, so a long silence does
        # not let the threshold creep up into real speech.
        if not vad_voice:
            if not self._noise_init:
                self._noise = rms
                self._noise_init = True
            else:
                self._noise = 0.995 * self._noise + 0.005 * rms

        floor = max(self._noise * 3.0, 0.0022)
        voiced = vad_voice and rms > floor

        if not self._speaking:
            self._preroll.append(f)
            if voiced:
                self._voiced_run += 1
                if self._voiced_run >= self.start_frames:
                    self._speaking = True
                    self._unvoiced_run = 0
                    self._seg = list(self._preroll)      # keep the pre-roll
                    self._preroll.clear()
                    self._next_partial_at = self.partial_every_s
                    self._seq += 1
            else:
                self._voiced_run = 0
            return

        # speaking
        self._seg.append(f)
        if voiced:
            self._unvoiced_run = 0
        else:
            self._unvoiced_run += 1

        dur = len(self._seg) * FRAME / SR

        if self._unvoiced_run >= self.end_frames:
            self._finish(dur, continued=False)
            return

        if dur >= self.max_segment_s:
            self._finish(dur, continued=True)
            return

        # Triggered on accumulated SPEECH time, not wall clock: deterministic,
        # and it does not misfire when the STT worker is briefly behind.
        if dur >= self._next_partial_at:
            self._next_partial_at = dur + self.partial_every_s
            self.on_partial(self.role, self._audio(), self._seq, dur)

    def _audio(self):
        return np.concatenate(self._seg) if self._seg else np.zeros(0, dtype=np.float32)

    def _finish(self, dur, continued):
        audio = self._audio()
        seq, was_continued = self._seq, self._continued

        if continued:
            # Long monologue: emit what we have and immediately start a new
            # segment so the speaker is never dropped mid-sentence.
            self._seg = []
            self._unvoiced_run = 0
            self._next_partial_at = self.partial_every_s
            self._continued = True
            self._seq += 1
        else:
            self._speaking = False
            self._seg = []
            self._voiced_run = self._unvoiced_run = 0
            self._preroll.clear()
            self._continued = False

        if dur * 1000.0 >= self.min_segment_ms:
            self.on_final(self.role, audio, seq, dur, continued or was_continued)
