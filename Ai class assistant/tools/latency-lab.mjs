// Finds the fastest viable brain configuration.
//
// The first measurement showed ~6 s to the first word on a warm session, with
// only ~1.6 s of that spent generating. So the cost is BEFORE the first token.
// Prime suspect: extended thinking. This compares models with and without it.
//
// Run:  node tools/latency-lab.mjs
import { query } from '@anthropic-ai/claude-agent-sdk';

const SYSTEM =
  'You help someone in a live meeting. Given what the other person said, reply with the words ' +
  'they should say back. First person, 2-3 sentences, under 45 words, plain spoken English. ' +
  'No preamble, no bullet points. Just the words.';

const TURNS = [
  'So tell me, how would you approach scaling the payment service when traffic triples during a flash sale?',
  'And how would you handle idempotency of the checkout requests?',
  'What about the database contention you mentioned?',
];

const CONFIGS = [
  { label: 'sonnet (default)', model: 'sonnet' },
  { label: 'sonnet, no thinking', model: 'sonnet', maxThinkingTokens: 0 },
  { label: 'haiku, no thinking', model: 'haiku', maxThinkingTokens: 0 },
];

async function run(cfg) {
  let resolveNext = null;
  const queue = [];
  const push = (text) => {
    const msg = { type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null, session_id: '' };
    if (resolveNext) { const r = resolveNext; resolveNext = null; r(msg); } else queue.push(msg);
  };
  async function* input() {
    while (true) {
      if (queue.length) { yield queue.shift(); continue; }
      yield await new Promise((res) => { resolveNext = res; });
    }
  }

  const opts = {
    systemPrompt: SYSTEM,
    allowedTools: [],
    includePartialMessages: true,
    model: cfg.model,
    permissionMode: 'bypassPermissions',
  };
  if (cfg.maxThinkingTokens !== undefined) opts.maxThinkingTokens = cfg.maxThinkingTokens;

  const q = query({ prompt: input(), options: opts });

  const rows = [];
  let turn = 0, t0 = Date.now(), ttft = 0, text = '';
  push(TURNS[turn]);

  try {
    for await (const m of q) {
      if (m.type === 'stream_event') {
        const d = m.event?.delta?.text;
        if (d) { if (!ttft) ttft = Date.now() - t0; text += d; }
        continue;
      }
      if (m.type !== 'result') continue;
      if (m.is_error) return { error: String(m.result || 'failed') };

      rows.push({ ttft, total: Date.now() - t0, words: text.trim().split(/\s+/).length });
      turn += 1;
      if (turn >= TURNS.length) break;
      ttft = 0; text = ''; t0 = Date.now();
      push(TURNS[turn]);
    }
  } catch (e) {
    return { error: String(e?.message || e) };
  }
  try { await q.return?.(); } catch { /* ignore */ }
  return { rows };
}

console.log('');
console.log('  config                    turn1 ttft   warm ttft   warm total   words');
console.log('  ' + '-'.repeat(72));

for (const cfg of CONFIGS) {
  const r = await run(cfg);
  if (r.error) {
    console.log('  ' + cfg.label.padEnd(24) + 'ERROR: ' + r.error.slice(0, 40));
    continue;
  }
  const warm = r.rows.slice(1);
  const avg = (k) => Math.round(warm.reduce((a, x) => a + x[k], 0) / Math.max(1, warm.length));
  console.log(
    '  ' + cfg.label.padEnd(24) +
    String(r.rows[0].ttft + ' ms').padEnd(13) +
    String(avg('ttft') + ' ms').padEnd(12) +
    String(avg('total') + ' ms').padEnd(13) +
    avg('words'),
  );
}
console.log('');
process.exit(0);
