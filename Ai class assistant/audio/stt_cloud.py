"""
Cloud speech backend -- the escape hatch for weak CPUs.

Why this exists: on a 2-core 2012 laptop `tiny.en` runs at ~0.5x realtime idle and
~1.0x with Meet running (see docs/BENCHMARKS.md). It works, but there is no headroom
and live partials are unaffordable. Sending each utterance to a hosted model
instead costs ~0% CPU and comes back in a few hundred milliseconds, which is
what makes the overlay feel conversational rather than delayed.

Deliberately batch-per-utterance rather than a streaming socket: it slots into
exactly the same `transcribe(audio, partial=)` interface the local backend
uses, so nothing else in the engine changes. The VAD has already decided where
the sentence ended, so the extra latency over true streaming is small.

Providers: deepgram (default) and openai. Both need a key, set in
Dashboard -> Settings -> Cloud API key. With no key this raises on first use and
the engine surfaces the error instead of silently going deaf.
"""

import io
import json
import urllib.error
import urllib.request
import wave

import numpy as np

SR = 16000


def _to_wav(audio):
    """float32 mono @16k -> 16-bit PCM WAV bytes."""
    pcm = np.clip(np.asarray(audio, dtype=np.float32) * 32767.0, -32768, 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    return buf.getvalue()


class CloudStream:
    def __init__(self, cfg, log=print):
        cfg = cfg or {}
        self.provider = (cfg.get("provider") or "deepgram").lower()
        self.api_key = (cfg.get("api_key") or "").strip()
        self.model = cfg.get("model") or ("nova-2" if self.provider == "deepgram" else "whisper-1")
        self.language = cfg.get("language") or "en"
        self.timeout = float(cfg.get("timeout", 12.0))
        self.log = log
        self.hotwords = []

        if not self.api_key:
            self.log("[stt-cloud] no API key set - cloud backend will fail until one is provided")

    def set_hotwords(self, terms):
        self.hotwords = [t.strip() for t in (terms or []) if t and t.strip()][:40]

    def transcribe(self, audio, partial=False):
        if audio is None or len(audio) < SR // 10:
            return ""
        if not self.api_key:
            raise RuntimeError(
                "Cloud speech is selected but no API key is set. "
                "Add one in Dashboard - Settings, or switch the backend back to local."
            )
        wav = _to_wav(audio)
        if self.provider == "deepgram":
            return self._deepgram(wav, partial)
        if self.provider == "openai":
            return self._openai(wav)
        raise RuntimeError(f"Unknown cloud speech provider: {self.provider}")

    # ---------- providers ----------

    def _deepgram(self, wav, partial):
        params = [
            f"model={self.model}",
            f"language={self.language}",
            "smart_format=true",
            "punctuate=true",
            "filler_words=false",
        ]
        # Deepgram's keyword boosting is the cloud equivalent of Whisper's
        # initial_prompt: it is what stops "idempotency" becoming "eye dampitancy".
        for kw in self.hotwords:
            params.append("keywords=" + urllib.request.quote(f"{kw}:2"))

        url = "https://api.deepgram.com/v1/listen?" + "&".join(params)
        req = urllib.request.Request(url, data=wav, method="POST")
        req.add_header("Authorization", "Token " + self.api_key)
        req.add_header("Content-Type", "audio/wav")

        data = self._send(req)
        try:
            alts = data["results"]["channels"][0]["alternatives"]
            return (alts[0].get("transcript") or "").strip() if alts else ""
        except (KeyError, IndexError, TypeError):
            return ""

    def _openai(self, wav):
        boundary = "----meetingcopilot"
        parts = []

        def field(name, value):
            parts.append(
                f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode()
            )

        field("model", self.model)
        field("language", self.language)
        field("response_format", "json")
        if self.hotwords:
            field("prompt", ", ".join(self.hotwords))

        parts.append(
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a.wav\"\r\n"
            f"Content-Type: audio/wav\r\n\r\n".encode()
        )
        parts.append(wav)
        parts.append(f"\r\n--{boundary}--\r\n".encode())
        body = b"".join(parts)

        req = urllib.request.Request(
            "https://api.openai.com/v1/audio/transcriptions", data=body, method="POST"
        )
        req.add_header("Authorization", "Bearer " + self.api_key)
        req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")

        data = self._send(req)
        return (data.get("text") or "").strip()

    def _send(self, req):
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                return json.loads(r.read().decode("utf-8", "replace"))
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = e.read().decode("utf-8", "replace")[:220]
            except Exception:
                pass
            if e.code in (401, 403):
                raise RuntimeError("Cloud speech rejected the API key (HTTP %d). %s" % (e.code, detail))
            raise RuntimeError("Cloud speech failed (HTTP %d). %s" % (e.code, detail))
        except urllib.error.URLError as e:
            raise RuntimeError("Cloud speech unreachable: %s" % (e.reason,))
