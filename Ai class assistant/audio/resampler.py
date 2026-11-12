"""
Stateful streaming resampler: any capture rate -> 16 kHz mono for Whisper.

Why not scipy.resample_poly per block: its polyphase filter is thousands of
taps wide at 44.1k->16k, so calling it once per audio callback puts a ~100 ms
filter transient at every block boundary. Over a meeting that is thousands of
little clicks, and Whisper hears them as consonants.

Instead: one continuous anti-alias FIR (state carried in `zi`) followed by
linear interpolation with a fractional read position carried across calls.
Mathematically continuous across blocks -- no seams, no clicks.
"""

import numpy as np
from scipy.signal import firwin, lfilter

TARGET_SR = 16000


class StreamResampler:
    def __init__(self, sr_in, sr_out=TARGET_SR, ntaps=101):
        self.sr_in = int(sr_in)
        self.sr_out = int(sr_out)
        self.bypass = self.sr_in == self.sr_out

        if not self.bypass:
            # Guard the 16 kHz Nyquist (8 kHz); 7.2 kHz leaves a clean transition band.
            cutoff = min(0.45 * self.sr_out, 0.45 * self.sr_in)
            self.h = firwin(ntaps, cutoff / (self.sr_in / 2.0)).astype(np.float64)
            self.zi = np.zeros(len(self.h) - 1, dtype=np.float64)
            self.prev = np.zeros(0, dtype=np.float64)
            self.pos = 0.0
            self.step = self.sr_in / float(self.sr_out)

    def process(self, x):
        """x: float32 mono at sr_in -> float32 mono at sr_out."""
        if self.bypass:
            return np.asarray(x, dtype=np.float32)
        if len(x) == 0:
            return np.zeros(0, dtype=np.float32)

        y, self.zi = lfilter(self.h, [1.0], np.asarray(x, dtype=np.float64), zi=self.zi)
        buf = np.concatenate([self.prev, y]) if len(self.prev) else y

        # How many output samples fit before we run out of interpolation headroom.
        #
        # Every position must satisfy pos < len(buf) - 1, because the linear
        # interpolation reads buf[i0 + 1]. Using floor(avail/step) + 1 here is
        # off by one whenever avail/step is a whole number -- which is exactly
        # what happens at integer rate ratios like 48000 -> 16000 (step 3.0).
        # That crashed every 48 kHz device with "index N is out of bounds",
        # while 44.1 kHz (step 2.756) silently got away with it.
        avail = (len(buf) - 1) - self.pos
        if avail <= 0:
            self.prev = buf
            return np.zeros(0, dtype=np.float32)
        n_out = int(np.ceil(avail / self.step))
        if n_out <= 0:
            self.prev = buf
            return np.zeros(0, dtype=np.float32)

        pos = self.pos + np.arange(n_out) * self.step
        i0 = np.floor(pos).astype(np.int64)
        np.clip(i0, 0, len(buf) - 2, out=i0)         # belt and braces
        frac = pos - i0
        out = buf[i0] * (1.0 - frac) + buf[i0 + 1] * frac

        consumed = int(i0[-1])
        self.prev = buf[consumed:]
        self.pos = (pos[-1] + self.step) - consumed
        return out.astype(np.float32)


def to_mono(buf, channels):
    """Interleaved float32 -> mono float32."""
    a = np.frombuffer(buf, dtype=np.float32)
    if channels <= 1:
        return a
    n = (len(a) // channels) * channels
    if n == 0:
        return np.zeros(0, dtype=np.float32)
    return a[:n].reshape(-1, channels).mean(axis=1)
