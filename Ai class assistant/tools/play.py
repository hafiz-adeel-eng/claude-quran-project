"""Play a wav through the current default output, for the test harnesses."""
import os, sys, wave
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "audio"))
import numpy as np
import pyaudiowpatch as pa
import devices

wav = sys.argv[1]
gain = float(sys.argv[2]) if len(sys.argv) > 2 else 0.75
p = pa.PyAudio()
try:
    out = devices.default_output(p)
    w = wave.open(wav, "rb")
    sr = w.getframerate()
    raw = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
    if w.getnchannels() > 1:
        raw = raw.reshape(-1, w.getnchannels()).mean(axis=1)
    osr = int(out["defaultSampleRate"]); och = min(2, out["maxOutputChannels"])
    idx = np.clip((np.arange(int(len(raw) * osr / sr)) * sr / osr).astype(np.int64), 0, len(raw) - 1)
    sig = (raw[idx] * gain).astype(np.float32)
    st = p.open(format=pa.paFloat32, channels=och, rate=osr, output=True,
                output_device_index=out["index"], frames_per_buffer=1024)
    for i in range(0, len(sig), 1024):
        st.write(np.repeat(sig[i:i + 1024], och).astype(np.float32).tobytes())
    st.stop_stream(); st.close()
finally:
    p.terminate()
