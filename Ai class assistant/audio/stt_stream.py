"""
Deepgram live streaming speech-to-text.

Why this exists rather than just using stt_cloud.py:

The batch client uploads a whole utterance AFTER the person stops talking.
Measured on a typical home connection, a 6-second question is 188 KB and takes 2.7 s to
upload -- barely faster than transcribing it locally, because the bottleneck is
his upload link, not the model.

Streaming moves that work earlier: audio goes up continuously WHILE they are
still speaking, so when they stop there is almost nothing left to send. Deepgram
does its own endpointing and returns a final a few hundred milliseconds later.

Same idea as the difference between emailing a video and watching one live.

Only the THEM source streams. Your own microphone stays on local Whisper --
it feeds context and notes, nothing is waiting on it, and streaming it too would
double the bill for no benefit.
"""

import asyncio
import json
import threading
import time
import urllib.parse

import numpy as np

SR = 16000


class DeepgramStream:
    """
    A persistent websocket to Deepgram, fed 16 kHz mono PCM.

    on_final(text, dur)    - an utterance ended (Deepgram's endpointing)
    on_partial(text, dur)  - interim words, free with streaming
    on_status(event, **kw) - connection state, for the UI
    """

    def __init__(self, cfg, on_final, on_partial=None, on_status=None, log=print):
        cfg = cfg or {}
        self.api_key = (cfg.get("api_key") or "").strip()
        self.model = cfg.get("model") or "nova-2"
        self.language = cfg.get("language") or "en"
        self.endpointing_ms = int(cfg.get("endpointing_ms", 500))
        self.interim = bool(cfg.get("interim_results", True))

        self.on_final = on_final
        self.on_partial = on_partial or (lambda *a, **k: None)
        self.on_status = on_status or (lambda *a, **k: None)
        self.log = log

        self._loop = None
        self._ws = None
        self._thread = None
        self._stop = threading.Event()
        self._queue = None
        self._connected = threading.Event()
        self._speech_started_at = None
        self._parts = []          # is_final fragments awaiting speech_final
        # Keywords supplied up front so the first connection already has them --
        # applying them later costs a reconnect, and a reconnect costs audio.
        self.hotwords = [t.strip() for t in (cfg.get("keywords") or []) if t and t.strip()][:40]
        self._pending = []        # audio captured while reconnecting
        self.last_error = None

    # ---------- lifecycle ----------

    def set_hotwords(self, terms):
        """
        Deepgram takes keyword boosting in the CONNECTION URL, so changing it on
        an open socket does nothing -- the brief's jargon was being silently
        ignored. Reconnect when it actually changes; this happens once, before
        the meeting starts.
        """
        new = [t.strip() for t in (terms or []) if t and t.strip()][:40]
        if new == self.hotwords:
            return
        self.hotwords = new
        if self._connected.is_set() and self._ws is not None and self._loop is not None:
            self.log("[deepgram] reconnecting to apply %d keyword(s)" % len(new))
            self.on_status("stream_reconfigure", keywords=len(new))
            try:
                # Closing makes _main fall through to its reconnect loop, which
                # rebuilds the URL with the new keywords.
                asyncio.run_coroutine_threadsafe(self._ws.close(), self._loop)
            except Exception:
                pass

    def _url(self):
        params = {
            "encoding": "linear16",
            "sample_rate": str(SR),
            "channels": "1",
            "model": self.model,
            "language": self.language,
            "punctuate": "true",
            "smart_format": "true",
            "interim_results": "true" if self.interim else "false",
            # How long a pause counts as the end of a sentence. Deepgram does
            # this server-side, so our own VAD is not in the critical path.
            # 300 ms was too twitchy -- it split "during a flash sale" into its
            # own turn, which would fire a second answer for one question. 500 ms
            # keeps sentences whole and still returns within ~0.5 s.
            "endpointing": str(self.endpointing_ms),
            "vad_events": "true",
        }
        q = urllib.parse.urlencode(params)
        for kw in self.hotwords:
            q += "&keywords=" + urllib.parse.quote(f"{kw}:2")
        return "wss://api.deepgram.com/v1/listen?" + q

    def start(self):
        if not self.api_key:
            raise RuntimeError(
                "Cloud speech is selected but no Deepgram key is set. "
                "Add one in Dashboard - Settings, or switch the backend back to local."
            )
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="deepgram", daemon=True)
        self._thread.start()
        # Give it a moment so the first words of a meeting are not dropped.
        # Generous, because on a 2-core machine this races with Claude warming
        # up and Whisper loading; 8 s was too short and caused a needless
        # fallback to local speech.
        self._connected.wait(timeout=20.0)
        return self._connected.is_set()

    def stop(self):
        self._stop.set()
        if self._loop and self._queue is not None:
            try:
                self._loop.call_soon_threadsafe(self._queue.put_nowait, None)
            except Exception:
                pass
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=3.0)

    @property
    def alive(self):
        return self._connected.is_set() and not self._stop.is_set()

    # ---------- feeding ----------

    def feed(self, pcm):
        """Push 16 kHz mono float32 audio. Called from the capture worker."""
        if self._stop.is_set() or pcm is None or len(pcm) == 0:
            return
        if self._speech_started_at is None:
            self._speech_started_at = time.time()
        data = np.clip(pcm * 32767.0, -32768, 32767).astype(np.int16).tobytes()

        if not self._connected.is_set():
            # Hold on to it rather than losing words mid-reconnect. ~5 s cap:
            # beyond that the audio is too stale to be worth sending.
            self._pending.append(data)
            if len(self._pending) > 160:
                self._pending = self._pending[-160:]
            return

        try:
            self._loop.call_soon_threadsafe(self._queue.put_nowait, data)
        except Exception:
            pass

    # ---------- internals ----------

    def _run(self):
        try:
            asyncio.run(self._main())
        except Exception as e:
            self.last_error = str(e)
            self.on_status("stream_error", error=str(e))
        finally:
            self._connected.clear()

    async def _main(self):
        import websockets

        backoff = 1.0
        while not self._stop.is_set():
            try:
                self._loop = asyncio.get_running_loop()
                self._queue = asyncio.Queue(maxsize=400)

                async with websockets.connect(
                    self._url(),
                    additional_headers={"Authorization": "Token " + self.api_key},
                    ping_interval=5, ping_timeout=20, max_queue=64,
                ) as ws:
                    self._ws = ws
                    self._connected.set()
                    backoff = 1.0
                    if self._pending:
                        held, self._pending = self._pending, []
                        for chunk in held:
                            try:
                                self._queue.put_nowait(chunk)
                            except Exception:
                                break
                        self.log("[deepgram] flushed %d buffered chunks" % len(held))
                    self.on_status("stream_open", model=self.model)
                    self.log("[deepgram] connected")

                    await asyncio.gather(
                        self._pump(ws),
                        self._listen(ws),
                    )
                # Normal close (e.g. a keyword reconfigure) lands here. Mark the
                # stream down so feed() buffers instead of dropping into a queue
                # nobody is reading -- that silently ate the first half of a
                # sentence every time the connection was replaced.
                self._connected.clear()
            except Exception as e:
                self._connected.clear()
                self.last_error = str(e)
                if self._stop.is_set():
                    break
                self.on_status("stream_reconnect", error=str(e)[:160])
                self.log("[deepgram] lost connection: %s" % str(e)[:160])
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 15.0)

    async def _pump(self, ws):
        """
        Send queued audio up as fast as it arrives, and keep the socket alive
        during silence.

        Deepgram hangs up with 1011 "No audio received recently" after about
        10 seconds of nothing. That happens in the gap between connecting and
        the first sound of the meeting, and any time the app is paused -- so the
        stream was dying before the call even started.
        """
        while not self._stop.is_set():
            try:
                chunk = await asyncio.wait_for(self._queue.get(), timeout=5.0)
            except asyncio.TimeoutError:
                try:
                    await ws.send(json.dumps({"type": "KeepAlive"}))
                except Exception:
                    return
                continue

            if chunk is None:
                try:
                    await ws.send(json.dumps({"type": "CloseStream"}))
                except Exception:
                    pass
                return
            await ws.send(chunk)

    async def _listen(self, ws):
        async for raw in ws:
            if self._stop.is_set():
                return
            try:
                m = json.loads(raw)
            except Exception:
                continue

            if m.get("type") == "Results":
                alts = (m.get("channel") or {}).get("alternatives") or []
                text = (alts[0].get("transcript") or "").strip() if alts else ""
                dur = float(m.get("duration") or 0.0)

                # Deepgram emits SEVERAL is_final fragments per sentence and then
                # marks the last one speech_final. Taking only the speech_final
                # one gives you the tail of the sentence and silently drops the
                # beginning ("triples during a flash sale?" instead of the whole
                # question), so the fragments have to be accumulated.
                if m.get("is_final"):
                    if text:
                        self._parts.append(text)
                    if m.get("speech_final"):
                        full = " ".join(self._parts).strip()
                        self._parts = []
                        if full:
                            started = self._speech_started_at
                            self._speech_started_at = None
                            self.on_final(full, dur or (time.time() - started if started else 0.0))
                elif text:
                    # Interim: show the sentence so far plus the words in flight.
                    self.on_partial(" ".join(self._parts + [text]).strip(), dur)

            elif m.get("type") == "Metadata":
                self.on_status("stream_metadata")
