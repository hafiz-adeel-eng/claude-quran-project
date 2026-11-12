# Benchmarks

Measured on the original development machine, a 2012 Windows laptop (i5-3337U, 2 cores / 4 threads,
8 GB, no usable GPU), unless a section says otherwise. A modern laptop is faster at every step.

Sample: 13.25 s of real English speech (Windows SAPI), 16 kHz mono, cpu_threads=3.
RTF = processing time / audio duration. Lower is better; >1.0x means it can never keep up.

| model    | load  | final (beam 2) | RTF    | partial (4 s, beam 1) | RTF    | accuracy |
|----------|-------|----------------|--------|-----------------------|--------|----------|
| tiny.en  | 4.1 s | 6.69 s         | 0.50x  | 2.77 s                | 0.69x  | verbatim |
| base.en  | 2.8 s | 12.78 s        | 0.96x  | 6.25 s                | 1.56x  | verbatim |
| small.en | -     | did not finish in 7 min | unusable | - | - | - |

## What this forces

These numbers are from an **idle** machine. Google Meet takes 1-1.5 cores, so
real in-meeting RTF is roughly double.

* `base.en` at 0.96x idle -> ~1.9x in a meeting. It falls permanently behind. Not viable.
* `tiny.en` at 0.50x idle -> ~1.0x in a meeting. Viable for FINALS ONLY.
* **Live partials are not affordable locally.** A partial re-transcribes the whole
  growing utterance, so a 10 s question costs ~5-7 s of CPU on its own. Enabling
  partials starves the finals. Default: partials OFF in local mode.

## Latency budget, local mode (tiny.en, finals only)

    0.60 s  silence before we call the sentence finished
  + 0.50 x utterance length  (transcribe)
  + 1.0-2.0 s  Claude first token
  = ~4-5 s after a 6 s question

## Latency budget, cloud STT

    0.25 s  streaming final
  + 1.0-2.0 s  Claude first token
  = ~1.5-2.5 s, and ~0 CPU so partials stay on

Local mode is the zero-setup default and it works. Cloud STT is the switch that
makes it feel conversational on this specific hardware.

---

# Brain latency (measured 2026-08-24, after the Claude login was fixed)

`node tools/latency-lab.mjs` -- warm session, 3 turns, ~50-word answers.

| config | 1st turn | warm 1st word | warm complete |
|---|---|---|---|
| sonnet, thinking on (old default) | 13.8 s | 2211 ms | 3977 ms |
| sonnet, thinking off | 11.2 s | 1713 ms | 4124 ms |
| **haiku, thinking off (now default)** | 9.9 s | **1287 ms** | **2135 ms** |

## Three changes this produced

1. **`maxThinkingTokens: 0`.** Extended thinking cost ~500 ms before the first
   word and bought nothing for a 2-4 sentence spoken reply.
2. **`haiku` for live answers, `sonnet` for prep and summaries.** Someone is
   waiting mid-conversation for the first; nobody is waiting for the second.
3. **Pre-warm on meeting start.** The first turn of a session costs ~10 s. That
   used to land on the first real question of the call. `Brain.prewarm()` now
   burns it while you are still setting up.

   The priming message is deliberately shaped like a real turn. A trivial
   "say ready" started the process but did not write the prompt cache, so the
   first genuine question still paid 5.1 s. With a realistic primer that dropped
   to 1.3 s.

`node tools/brain-latency.js` -- through the real Brain class, including pre-warm:

    Q1  first word 1259 ms | complete 2744 ms
    Q2  first word 1150 ms | complete 2240 ms
    Q3  first word 1308 ms | complete 2571 ms
    average: first word 1239 ms | full answer 2518 ms

Net effect: first word went from **6142 ms to 1239 ms**.

## Real end-to-end delay after they stop talking

    0.60 s  silence detection
  + ~2.5 s  transcription (tiny.en at ~0.5x on a 5 s question)
  + 1.2 s   first words appear on the overlay
  = about 4.3 s before you can start speaking

**Transcription is now the bottleneck, not the brain.** Switching Settings ->
Speech backend to cloud removes ~2.5 s of that.

---

# Sonnet 5 as the live model (set 2026-08-24 on request)

`node tools/brain-latency.js`, warm session, through the real Brain class:

| live model | warm 1st word | full answer | words |
|---|---|---|---|
| Haiku 4.5 | 1239 ms | 2518 ms | ~58 |
| **Sonnet 5 (default)** | **~2000 ms** | **3720 ms** | ~48 |

Sonnet 5 costs roughly 0.75 s more to the first word. It is the default because
it sticks to the brief more reliably, and the words get read out loud.
Switch to Haiku 4.5 in Settings if speed matters more on the day.

Sonnet 5 also ignored the word limit (61-74 words against a stated 60), so the
prompt now states it as a HARD LIMIT with a reason. Answers dropped to 45-51
words and completed ~350 ms faster.

Real delay after they stop talking: **~5.2 s** (0.6 s silence + ~2.5 s
transcription + ~2.1 s first words). Transcription is still the bottleneck.

---

# Streaming speech + Haiku (set 2026-08-24 on request) -- CURRENT DEFAULT

Deepgram key supplied. First attempt used the BATCH client and barely helped:
a 6 s question is 188 KB and took **2.72 s** to upload -- the bottleneck was the
upload link, not the model. Switching to the **streaming** API sends audio while
the person is still talking, so almost nothing is left to send when they stop.

| speech path | transcript ready after they stop |
|---|---|
| local `tiny.en` | ~2.5-3.3 s (5.3 s when the CPU is busy) |
| Deepgram batch | 2.72 s |
| **Deepgram streaming** | **0.2-0.4 s** |

## Measured end to end (`node tools/latency-e2e.js`)

    transcript ready  0.4 s
    words on screen   2.1 s   <-- when he can start speaking
    full answer       3.6 s

Down from ~5 s (local + Sonnet 5) and ~7.9 s under CPU load.

Tuning notes, all found by running it:

* `endpointing_ms` 300 -> **500**. At 300 ms Deepgram split "during a flash sale"
  into its own turn, which fires a second answer for one question. 500 ms keeps
  sentences whole and still returns in ~0.5 s.
* Keywords must be passed **at connect time**. Deepgram takes them in the URL, so
  setting them later forces a reconnect -- and a reconnect was silently eating
  the first half of a sentence. Audio is now buffered across reconnects too.
* Deepgram hangs up with 1011 after ~10 s of no audio, which killed the stream
  before the meeting started. A KeepAlive every 5 s fixes it.
* Only THEM streams. ME stays on local Whisper -- nothing waits on it, and
  streaming it would double the bill for no benefit.

---

# Long monologues (2026-08-24)

"If the client talks continuously for 2-3 minutes, does it cope?" Measured with
95 seconds of unbroken speech (`tools/monologue-test.js`, `data/long.wav`).

**Before:** the speech service closes a sentence at every natural pause, so 95 s
arrived as **8 separate finals, 6-20 s apart** -- and each one fired its own
answer. The panel rewrote itself eight times while they were still mid-thought,
and only the last answer was any use.

**After** (`src/main/turnbuffer.js`): sentences are held and released as one
question once the line has actually gone quiet. Same 95 s now produces **3
answers** instead of 8 -- one interim (the 60 s safety valve, merging 6
sentences), then updates as they carry on.

A timer alone cannot tell "paused for breath" from "finished" -- both are just a
gap between finals. The **audio level** can, so the buffer holds while the
loopback still carries sound and releases after 900 ms of real quiet.

**It costs nothing on a normal question:** still 0.5 s to transcript, **2.1 s to
words on screen**, 2.7 s to a full answer. The quiet timer runs while the
transcript is still arriving, so it is free.

Tunables in `turnbuffer.js`: `quietMs` 900, `maxWaitMs` 60000.

---

# The brief was reaching Claude but not being USED (2026-08-26)

From the real client call: the brief held **19,432 chars** and it was reaching the
model in full. But it was a SCRIPT -- 314 prepared lines marked with an arrow and
"SAY", plus 54 private "DON'T SAY" reminders -- and the prompt labelled the whole
thing *"Background, skills and facts I may use"*.

Counted against the 50 answers that call produced:

| | before | after |
|---|---|---|
| prepared lines actually used | **1 of 166** | most answers now draw on them |
| answer wording taken from the brief | - | **60-92%** of content words |
| private notes read aloud | 0 | 0 (now explicitly forbidden and tested) |

Three changes:

1. **The label.** It now reads "MY PERSON'S PREPARED MATERIAL ... the FIRST place
   to look for what to say" instead of "background facts". That single change did
   most of the work.
2. **Explicit instructions** to reuse the prepared wording and adapt it to what
   was actually asked, plus a hard rule that anything marked DON'T SAY / NOTE is
   for the user's eyes only. `tools/test-private-notes.js` is the regression:
   a brief containing a secret price floor, asked three times, never leaks it.
3. **The warm-up was poisoning the first answer.** The primer sent a fake turn
   ("Just checking you can hear me alright?"), Claude answered it, and because
   the session keeps its history EVERY call's first real answer opened with
   "Yeah, I can hear you perfectly." The primer now states it is not part of the
   meeting and asks for one throwaway word.

Also fixed while in there: `Brain` tracked a single in-flight request, so a
question arriving during the warm-up received the WARM-UP's reply. Requests are
now an ordered queue matched to results by position.

---

# The prepared material now behaves like a skill (2026-08-26)

The intent: the material should be followed EXACTLY where it covers something,
and new questions should be answered from inside it. The prompt was telling the
model to "adapt, shorten, reorder", which is the opposite of exact.

Rewritten as two explicit modes, and pinned by `tools/test-script-mode.js`:

**Mode 1 - the script covers it:** use the prepared line as close to word for word
as possible; change only a name, a connector, or drop a sentence that no longer
applies. Never paraphrase it away.

**Mode 2 - it does not:** answer, but only with facts, numbers, prices and claims
that appear in the material, in its voice. Never introduce a capability, price or
promise that is not there. If the answer genuinely is not in it, offer to confirm
after the call.

Test result (brief with a fixed price, a fixed timeline, and no mention of
Instagram):

| question | behaviour |
|---|---|
| "what did you find?" | returned his prepared line verbatim |
| "what would this cost?" | "It is 450 dollars a month..." - his exact wording |
| "how long before I see anything?" | his exact 3-4 week line |
| "would you run my Instagram too?" | declined, stayed in scope, invented nothing |
| "do you guarantee I'll double sales?" | "I can't guarantee that..." - no promise |

ALL 5 PASS.
