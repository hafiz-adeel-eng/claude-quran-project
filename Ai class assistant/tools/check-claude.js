'use strict';
/**
 * Tells you, in plain terms, whether Meeting Copilot can reach Claude -- and if
 * it can, how fast answers actually come back.
 *
 * Run:  node tools/check-claude.js        (or double-click CHECK-CLAUDE.bat)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const store = require('../src/main/store');
const { spawnEnv, claudeExe, claudeCwd } = require('../src/main/brain');

const SYSTEM =
  'You help someone in a live meeting. Given what the other person said, reply with the words ' +
  'they should say back. First person, 2-3 sentences, under 50 words, plain spoken English. No preamble.';

const TURNS = [
  'So tell me, how would you approach scaling the payment service when traffic triples during a flash sale?',
  'And how would you handle idempotency of the checkout requests?',
  'What about the database contention you mentioned?',
];

function line() { console.log('  ' + '-'.repeat(66)); }

function credentialState() {
  // On a Mac the Claude CLI keeps its sign-in in the login Keychain, not in a
  // file, so a missing file says nothing there. The real request below is
  // what decides.
  if (process.platform === 'darwin') {
    return { present: true, detail: 'kept in the macOS Keychain (checked by a real request below)', plan: '-' };
  }
  const p = path.join(os.homedir(), '.claude', '.credentials.json');
  if (!fs.existsSync(p)) return { present: false, detail: 'no ~/.claude/.credentials.json' };
  try {
    const d = JSON.parse(fs.readFileSync(p, 'utf8')).claudeAiOauth || {};
    const alen = String(d.accessToken || '').length;
    const rlen = String(d.refreshToken || '').length;
    const exp = Number(d.expiresAt || 0);
    const when = exp ? new Date(exp > 1e11 ? exp : exp * 1000) : null;
    return {
      present: alen > 0,
      detail: alen > 0
        ? `token present (${alen} chars), expires ${when ? when.toLocaleString() : 'unknown'}`
        : `token is EMPTY (access ${alen}, refresh ${rlen}) - the CLI has no stored session`,
      plan: d.subscriptionType || 'unknown',
    };
  } catch (e) {
    return { present: false, detail: 'unreadable: ' + e.message };
  }
}

(async () => {
  console.log('');
  console.log('  Meeting Copilot - Claude connection check');
  line();

  const settings = store.getSettings();
  const usingKey = !!(settings.brain.apiKey || '').trim();

  const cred = credentialState();
  console.log('  stored CLI session :', cred.detail);
  console.log('  plan on file       :', cred.plan || '-');
  console.log('  Anthropic API key  :', usingKey ? 'set in Settings (will bill per token)' : 'not set (using the subscription)');
  line();

  if (!cred.present && !usingKey) {
    console.log('  No usable credentials found yet.');
    console.log('');
    console.log('  Do ONE of these:');
    console.log('    a) Open a terminal, run   claude   then type   /login');
    console.log('       and finish the sign-in in your browser. This uses your subscription.');
    console.log('    b) Or paste an Anthropic API key into Dashboard -> Settings');
    console.log('       (this bills per token instead of using the subscription).');
    console.log('');
    console.log('  Trying anyway, in case a session exists elsewhere...');
    line();
  }

  let q;
  try {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');

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

    q = query({
      prompt: input(),
      options: {
        systemPrompt: SYSTEM,
        allowedTools: [],
        includePartialMessages: true,
        model: settings.brain.model || 'sonnet',
        permissionMode: 'bypassPermissions',
        env: spawnEnv(settings.brain),
        cwd: claudeCwd(),
        ...claudeExe(),
      },
    });

    let turn = 0, t0 = Date.now(), ttft = 0, text = '';
    const results = [];
    push(TURNS[turn]);

    for await (const m of q) {
      if (m.type === 'stream_event') {
        const d = m.event?.delta?.text;
        if (d) { if (!ttft) ttft = Date.now() - t0; text += d; }
        continue;
      }
      if (m.type !== 'result') continue;

      if (m.is_error) {
        const msg = String(m.result || 'unknown error');
        console.log('  RESULT: cannot reach Claude');
        console.log('  reason:', msg);
        console.log('');
        if (/api key|login|authenticate|oauth|expired/i.test(msg)) {
          console.log('  Fix: open a terminal, run  claude , type  /login , finish it in the browser.');
          console.log('       Then run this check again.');
          console.log('       (Or paste an Anthropic API key in Dashboard -> Settings.)');
        }
        console.log('');
        process.exit(1);
      }

      const total = Date.now() - t0;
      results.push({ ttft, total, words: text.trim().split(/\s+/).length });
      console.log(`  turn ${turn + 1}: first word ${ttft} ms | complete ${total} ms | ${text.trim().split(/\s+/).length} words`);
      console.log(`          "${text.trim().slice(0, 90)}${text.trim().length > 90 ? '…' : ''}"`);

      turn += 1;
      if (turn >= TURNS.length) break;
      ttft = 0; text = ''; t0 = Date.now();
      push(TURNS[turn]);
    }

    line();
    const warm = results.slice(1);
    const avgT = warm.length ? Math.round(warm.reduce((a, r) => a + r.ttft, 0) / warm.length) : results[0].ttft;
    const avgC = warm.length ? Math.round(warm.reduce((a, r) => a + r.total, 0) / warm.length) : results[0].total;
    console.log('  RESULT: Claude is working.');
    console.log(`  first turn of a meeting is slowest (${results[0].total} ms) - the session is warming up.`);
    console.log(`  after that: first word in ~${avgT} ms, full answer in ~${avgC} ms.`);
    console.log('');
    console.log(`  Add ~0.6 s of silence detection + transcription on top for the real`);
    console.log(`  in-meeting delay. See docs/BENCHMARKS.md.`);
    console.log('');
    process.exit(0);
  } catch (e) {
    console.log('  RESULT: failed to start Claude');
    console.log('  ', String((e && e.message) || e));
    console.log('');
    process.exit(1);
  }
})();
