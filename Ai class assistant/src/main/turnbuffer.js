'use strict';
/**
 * Holds what the other person is saying until they have actually finished.
 *
 * The problem, measured: 95 seconds of continuous talking arrives as EIGHT
 * separate finals, 6-20 seconds apart, because the speech service closes a
 * sentence at every natural pause. Answering each one means the panel rewrites
 * itself eight times while they are still mid-thought, wastes eight requests,
 * and only the last answer is any use.
 *
 * A timer alone cannot separate "paused for breath" from "finished" -- both are
 * just a gap between finals. The AUDIO LEVEL can: if the loopback is still
 * carrying sound, they are still talking. So this buffers sentences and only
 * releases them once the line has genuinely gone quiet.
 *
 * `maxWaitMs` is the safety valve: on a very long monologue it releases an
 * interim answer rather than leaving the user staring at nothing.
 */

class TurnBuffer {
  constructor(opts = {}) {
    // Measured on a real client call: the silence between her turns is bimodal
    // -- either under 250 ms (the speech service chopping one thought into
    // pieces) or over 6 s (she genuinely finished). 1200 ms sits clear of the
    // first cluster without paying for the second. The fragment check below
    // does the rest of the work.
    this.quietMs = opts.quietMs != null ? opts.quietMs : 1200;
    // Wait once the sentence already looks finished. Short on purpose: the
    // speech service has already sat through 500 ms of silence to decide the
    // sentence ended, so this only guards against it resuming immediately.
    this.readyMs = opts.readyMs != null ? opts.readyMs : 250;
    this.maxWaitMs = opts.maxWaitMs != null ? opts.maxWaitMs : 60000;
    // 250 ms of polling granularity was itself a quarter second of the delay.
    this.pollMs = opts.pollMs != null ? opts.pollMs : 100;
    this.loudLevel = opts.loudLevel != null ? opts.loudLevel : 0.006;

    this.onFlush = opts.onFlush || (() => {});
    this.onWaiting = opts.onWaiting || (() => {});
    this.now = opts.now || (() => Date.now());

    this.pending = [];
    this.startedAt = 0;
    this.lastLoudAt = 0;
    this._timer = null;
  }

  /** Feed the THEM audio level (from the engine's level events). */
  noteLevel(level) {
    if ((level || 0) > this.loudLevel) this.lastLoudAt = this.now();
  }

  /** A completed sentence from the other person. */
  push(text) {
    const t = String(text || '').trim();
    if (!t) return;
    this.pending.push(t);
    if (!this.startedAt) this.startedAt = this.now();
    this._schedule();
  }

  get held() { return this.pending.length; }

  _schedule() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this._tick(), this.pollMs);
  }

  /**
   * Does this look like a finished thought, or half of one?
   *
   * From the real client meeting: 39% of her turns were four words or fewer --
   * "part of it's just, like, instead of bad things" reached Claude as if it
   * were a question, and got a confident answer to nothing. Fragments are held
   * until they join up with what comes next.
   */
  _isSubstantive(text) {
    const t = String(text || '').trim();
    if (!t) return false;

    // Ends mid-thought. From the real call: "Right? So that's where the SEO part
    // comes in. And" was answered with "Yes, I can hear you perfectly" -- it slipped
    // through because it contains a question mark, even though the sentence was
    // obviously unfinished. A trailing connective means more is coming.
    if (TurnBuffer.DANGLING.test(t)) return false;

    if (t.includes('?')) return true;              // a real, finished question
    const words = t.split(/\s+/).length;
    if (words >= 8) return true;
    // Short but self-contained ("yes, go ahead.", "that works for me.").
    // Terminal punctuation is the signal; the speech service adds it.
    return words >= 3 && /[.!?]$/.test(t);
  }

  _tick() {
    if (!this.pending.length) return;
    const quietFor = this.now() - this.lastLoudAt;
    const waited = this.now() - this.startedAt;

    if (waited >= this.maxWaitMs) return this.flush(true);

    const joined = this.pending.join(' ').trim();
    const complete = this._isSubstantive(joined);

    // The wait is ADAPTIVE, and this is where most of the felt delay lived.
    //
    // A flat 1200 ms was applied even to a finished question, on top of the
    // 500 ms the speech service already waited before calling it final -- so
    // Claude was not even asked for nearly two seconds. That is pure dead time
    // when the person has plainly finished a sentence.
    //
    // Finished thought  -> a short confirmation pause; the speech service's own
    //                      silence detection is already the evidence.
    // Half a sentence   -> the long wait, because answering a fragment is the
    //                      failure that lost a real client.
    const needQuiet = complete ? this.readyMs : this.quietMs;

    if (quietFor >= needQuiet) return this.flush(false);
    if (!complete && quietFor >= this.quietMs * 3) return this.flush(false);

    this.onWaiting({ held: this.pending.length, waited, fragment: !complete });
    this._schedule();
  }

  /**
   * Release everything held as one question.
   * @param {boolean} interim - released mid-monologue by the safety valve.
   */
  flush(interim = false) {
    clearTimeout(this._timer);
    this._timer = null;
    if (!this.pending.length) return null;
    const text = this.pending.join(' ').replace(/\s+/g, ' ').trim();
    const parts = this.pending.length;
    this.pending = [];
    this.startedAt = 0;
    this.onFlush(text, { interim, parts });
    return text;
  }

  reset() {
    clearTimeout(this._timer);
    this._timer = null;
    this.pending = [];
    this.startedAt = 0;
  }
}

// Words that mean the sentence is not finished, at the very end of what has been
// heard so far. A regex LITERAL, not a string: in a string "\b" is a backspace
// character rather than a word boundary, which silently matches nothing.
//
// Note the trailing class allows only spaces and commas, so a full stop protects
// a finished sentence -- "go ahead." is complete, "comes in. And" is not.
TurnBuffer.DANGLING = /\b(and|but|so|or|because|that|then|the|a|an|to|of|for|with|from|in|on|at|if|when|while|which|who|like|about|into|over|as|is|are|was|were|be|been|have|has|had|will|would|can|could|should|my|our|your|their|its)[\s,]*$/i;

module.exports = { TurnBuffer };
