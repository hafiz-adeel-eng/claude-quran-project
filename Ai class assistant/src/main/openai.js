'use strict';
/**
 * OpenAI backup brain.
 *
 * IMPORTANT: this is NOT ChatGPT Plus. A Plus subscription is for the ChatGPT
 * app only -- it grants no API access and the desktop app exposes no local
 * endpoint. This talks to the OpenAI API, which is billed separately, per token,
 * with a key from platform.openai.com.
 *
 * Why it exists: if Claude is rate-limited or its login lapses in the middle of
 * a real meeting, having a second engine means the overlay keeps producing
 * answers instead of going silent at the worst possible moment.
 *
 * Stateless by design. Each request carries its own context block (the brief and
 * the recent transcript), so there is no session to keep warm and nothing to
 * resynchronise after an error.
 */

const DEFAULT_MODEL = 'gpt-4o-mini';   // fast + cheap; latency matters more than depth here
const ENDPOINT = 'https://api.openai.com/v1/chat/completions';

class OpenAIEngine {
  constructor(settings = {}, log = () => {}) {
    this.apiKey = (settings.openaiKey || '').trim();
    this.model = settings.openaiModel || DEFAULT_MODEL;
    this.log = log;
    this.system = '';
    this._abort = null;
  }

  get configured() {
    return !!this.apiKey;
  }

  setSystem(system) {
    this.system = system || '';
  }

  /** Cancel an in-flight answer -- used when a newer question arrives. */
  abort() {
    if (this._abort) {
      try { this._abort.abort(); } catch { /* already gone */ }
      this._abort = null;
    }
  }

  /**
   * Stream one completion.
   * onDelta(chunk, full) is called as text arrives; resolves with the full text.
   */
  async send(userText, onDelta, opts = {}) {
    if (!this.configured) {
      throw new Error('No OpenAI API key set. Add one in Dashboard - Settings.');
    }

    this.abort();
    const controller = new AbortController();
    this._abort = controller;

    const body = {
      model: this.model,
      stream: true,
      temperature: opts.temperature != null ? opts.temperature : 0.4,
      max_tokens: opts.maxTokens || 400,
      messages: [
        ...(this.system ? [{ role: 'system', content: this.system }] : []),
        { role: 'user', content: userText },
      ],
    };

    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + this.apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      this._abort = null;
      if (e.name === 'AbortError') return '';
      throw new Error('Could not reach OpenAI: ' + (e.message || e));
    }

    if (!res.ok) {
      this._abort = null;
      let detail = '';
      try { detail = (await res.text()).slice(0, 200); } catch { /* ignore */ }
      if (res.status === 401) throw new Error('OpenAI rejected the API key (401). Check it in Settings.');
      if (res.status === 429) throw new Error('OpenAI rate limit or no credit (429). ' + detail);
      throw new Error('OpenAI request failed (' + res.status + '). ' + detail);
    }

    // Server-sent events: "data: {json}\n\n", terminated by "data: [DONE]".
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let nl;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line.startsWith('data:')) continue;

          const payload = line.slice(5).trim();
          if (payload === '[DONE]') { buffer = ''; break; }

          try {
            const j = JSON.parse(payload);
            const piece = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
            if (piece) {
              full += piece;
              if (onDelta) onDelta(piece, full);
            }
          } catch {
            // A partial JSON chunk split across reads; the next loop completes it.
          }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') throw e;
    } finally {
      this._abort = null;
    }

    return full.trim();
  }
}

module.exports = { OpenAIEngine, DEFAULT_MODEL };
