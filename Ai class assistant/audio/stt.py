"""
Speech-to-text backends.

LocalWhisper  - faster-whisper on CPU. No keys, no internet, no per-minute cost.
                Two models: a fast one for live partials, a better one for the
                final text that Claude actually reads.
CloudStream   - optional low-latency backend for weak CPUs (see stt_cloud.py).

Whisper's biggest practical problem in a meeting is hallucination on silence:
fed near-empty audio it confidently returns "Thank you." or "Thanks for
watching!" -- which would fire Claude at nothing. `looks_hallucinated` kills
those before they reach the brain.
"""

import re
import threading

import numpy as np

SR = 16000

# Whisper's stock filler on silence/music. Only rejected when the clip is short
# or quiet, so a genuine "thank you" mid-conversation still survives.
_HALLUCINATIONS = {
    "thank you", "thanks for watching", "thank you for watching",
    "thanks for watching!", "you", "bye", "bye.", "okay", ".", "..", "...",
    "subtitles by the amara.org community", "subs by www.zeoranger.co.uk",
    "please subscribe", "like and subscribe", "music", "[music]", "(music)",
    "applause", "[applause]", "silence", "[silence]", "so", "hmm", "mm",
    "thank you very much", "thank you.", "i'm sorry", "oh",
    # Seen live on this machine from an idle microphone. Whisper produces these
    # from room noise with high confidence, which is why energy gates alone miss
    # them.
    "i'll see you next time", "see you next time", "see you in the next video",
    "thanks for listening", "goodbye", "bye bye", "the end", "to be continued",
    "don't forget to subscribe", "hit the like button", "peace",
    "transcription by castingwords", "transcribed by", "www.mooji.org",
}

_STRIP = re.compile(r"^[\s\W_]+|[\s\W_]+$", re.UNICODE)


def normalise(t):
    return _STRIP.sub("", (t or "")).strip()


def _is_degenerate(t):
    """
    Catches Whisper's runaway outputs on noise.

    Observed live: a mic picking up room noise produced
    "1,000,000,000,000,000,000,000,000,000,000". That has no spaces, so the
    word-repetition rule below never saw it. These checks work on characters
    and on periodicity, which is what degenerate decoding actually looks like.
    """
    compact = "".join(t.split())
    if len(compact) >= 12:
        # Almost no distinct characters: "1,000,000,000..." -> {1 , 0}
        if len(set(compact)) <= 4:
            return True
        # Not speech at all if it contains no letters.
        if not any(c.isalpha() for c in compact):
            return True
        # A short unit repeated over and over ("hahahaha", ",000,000,000").
        for period in range(1, 7):
            if len(compact) < period * 4:
                break
            unit = compact[:period]
            if unit * (len(compact) // period) == compact[:period * (len(compact) // period)]:
                return True

    words = t.split()
    if len(words) >= 8 and len(set(words)) <= 2:
        return True
    # One token hammered repeatedly inside a longer output.
    if words:
        top = max(words.count(w) for w in set(words))
        if top >= 5 and top >= 0.6 * len(words):
            return True

    # A whole PHRASE looping. Seen live from an idle mic: "I'm going to go to
    # the next video" repeated fourteen times. The character and single-word
    # rules above all miss this -- there are plenty of distinct characters and
    # no single word dominates -- so measure vocabulary richness instead.
    if len(words) >= 20 and (len(set(words)) / len(words)) < 0.25:
        return True

    # The same few words cycling: words[:p] repeated fills the whole output.
    for p in range(1, min(13, len(words) // 3 + 1)):
        reps = len(words) // p
        if reps >= 3 and words[:p] * reps == words[:p * reps]:
            return True

    return False


def looks_hallucinated(text, audio, dur):
    """True when this transcript is almost certainly Whisper filling silence."""
    t = normalise(text).lower()
    if not t:
        return True
    if len(audio) == 0:
        return True

    rms = float(np.sqrt(np.mean(audio.astype(np.float64) ** 2)))
    peak = float(np.max(np.abs(audio)))

    # Nothing was really said.
    if rms < 0.0022 or peak < 0.02:
        return True
    # Stock filler on a short or quiet clip.
    if t in _HALLUCINATIONS and (dur < 2.5 or rms < 0.012):
        return True
    # A single stray token from a long clip means the audio was not speech.
    if dur > 3.0 and len(t) <= 3:
        return True
    # One-word output from a clip long enough to hold a sentence. Real speech of
    # this length says more than one word; noise regularly produces exactly one.
    if dur >= 1.5 and len(t.split()) <= 1:
        return True
    if _is_degenerate(t):
        return True
    return False


class LocalWhisper:
    """CPU Whisper. All calls are serialised -- see the engine's single worker."""

    def __init__(self, partial_model="tiny.en", final_model="base.en",
                 compute_type="int8", cpu_threads=3, language="en", log=print):
        from faster_whisper import WhisperModel

        self.log = log
        self.language = None if language in (None, "", "auto") else language
        self._lock = threading.Lock()

        self.log(f"[stt] loading final model '{final_model}' ({compute_type}, {cpu_threads} threads)")
        self.final = WhisperModel(final_model, device="cpu",
                                  compute_type=compute_type, cpu_threads=cpu_threads,
                                  num_workers=1)

        if partial_model == final_model:
            self.partial = self.final
        else:
            self.log(f"[stt] loading partial model '{partial_model}'")
            self.partial = WhisperModel(partial_model, device="cpu",
                                        compute_type=compute_type, cpu_threads=cpu_threads,
                                        num_workers=1)

        self.hotwords = ""     # set from the meeting brief; big accuracy win on jargon

    def set_hotwords(self, terms):
        """Names, products and jargon from the pre-meeting brief."""
        terms = [t.strip() for t in (terms or []) if t and t.strip()]
        self.hotwords = ", ".join(terms[:60])

    def transcribe(self, audio, partial=False):
        if audio is None or len(audio) < SR // 10:
            return ""
        model = self.partial if partial else self.final
        with self._lock:
            segments, _ = model.transcribe(
                audio,
                language=self.language,
                beam_size=1 if partial else 2,
                best_of=1,
                temperature=0.0,
                vad_filter=False,                    # already segmented upstream
                condition_on_previous_text=False,    # stops runaway repetition
                word_timestamps=False,
                initial_prompt=self.hotwords or None,
                no_speech_threshold=0.6,
                log_prob_threshold=-1.0,
            )
            return " ".join(s.text.strip() for s in segments).strip()
