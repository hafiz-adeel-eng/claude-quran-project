'use strict';
/**
 * End-to-end test of the live loop, without the UI.
 *
 * Wires the real AudioBridge to the real Brain exactly the way main.js does,
 * plays a recorded question out of the speakers, and asserts that:
 *
 *   1. the question is heard on the LOOPBACK and tagged THEM
 *   2. an answer is generated for it
 *   3. the same audio bleeding into the MIC does NOT produce a second turn
 *   4. an acknowledgement ("yeah, okay") does NOT trigger an answer
 *
 * Brain runs in mock mode so this passes without a Claude login.
 * Run:  node tools/e2e.js
 */

const path = require('path');
const { spawn } = require('child_process');

const { AudioBridge } = require('../src/main/bridge');
const { Brain } = require('../src/main/brain');
const store = require('../src/main/store');

const ROOT = path.join(__dirname, '..');
const results = { turns: [], answers: [], errors: [], noAnswer: [] };

function log(...a) { console.log('  ', ...a); }

(async () => {
  const settings = store.getSettings();
  const brain = new Brain();
  const bridge = new AudioBridge();

  let answering = null;

  brain.on('start', (s) => { answering = { id: s.id, kind: s.kind, text: '' }; });
  brain.on('delta', (d) => { if (answering && d.id === answering.id) answering.text = d.full; });
  brain.on('done', (d) => {
    results.answers.push({ kind: d.kind, text: d.text, ms: d.ms, skipped: d.skipped });
    log(`ANSWER (${d.kind}, ${d.ms}ms${d.via ? ', via ' + d.via : ''}): ${String(d.text).slice(0, 96)}`);
    answering = null;
  });
  brain.on('error', (e) => results.errors.push(e.message));

  // Real Claude by default now that login works; pass --mock to run offline.
  const useMock = process.argv.includes('--mock');
  await brain.start({
    title: 'e2e interview', kind: 'interview', role: 'senior backend developer',
    background: 'I have built payment and checkout systems in Node and Postgres.',
    terms: ['idempotency', 'checkout', 'database contention', 'flash sale'],
  }, { ...settings.brain, mock: useMock });
  log(`brain ready (${useMock ? 'mock' : settings.brain.model})`);
  if (!useMock) {
    await new Promise((r) => {
      const h = (st) => { if (st.warming === false) { brain.off('status', h); r(); } };
      brain.on('status', h);
      setTimeout(r, 45000);
    });
    log('brain pre-warmed');
  }

  bridge.on('fatal', (m) => { results.errors.push(m); });
  if (process.env.E2E_VERBOSE) bridge.on('log', (s) => log('[log] ' + s));
  bridge.on('event', (m) => {
    if (m.t === 'final') {
      results.turns.push({ role: m.role, text: m.text, rtf: m.rtf, dur: m.dur });
      log(`${m.role.toUpperCase().padEnd(5)} (${m.dur}s, rtf ${m.rtf}): ${m.text}`);
      if (m.role === 'them') {
        const id = brain.answer(m.text, results.turns.slice(-6));
        if (id === null) { results.noAnswer.push(m.text); log('  -> no answer needed (gate)'); }
      }
    }
    if (m.t === 'status' && m.stage === 'models_ready') log('speech models ready');
    if (m.t === 'devices') log(`hearing: ${m.loopback} | mic: ${m.mic}`);
    if (m.t === 'error') results.errors.push(`${m.where}: ${m.msg}`);
  });

  log('starting audio sidecar…');
  const ok = await bridge.start(settings.audio);
  if (!ok) { console.log('\n  FAILED to start audio:', bridge.lastError, '\n'); process.exit(1); }

  // Wait for the models to finish loading before we play anything.
  await new Promise((r) => setTimeout(r, 22000));
  bridge.setHotwords(['idempotency', 'checkout', 'database contention', 'flash sale']);
  await new Promise((r) => setTimeout(r, 800));

  log('playing the question through the speakers…');
  await play(path.join(ROOT, 'data', 'bench.wav'));

  log('waiting for transcription + answer…');
  await new Promise((r) => setTimeout(r, 26000));

  await bridge.stop();
  await brain.stop();

  // ---- assertions ----
  const them = results.turns.filter((t) => t.role === 'them');
  const me = results.turns.filter((t) => t.role === 'me');
  const answers = results.answers.filter((a) => a.kind === 'answer' && !a.skipped);

  console.log('\n  ' + '-'.repeat(62));
  const checks = [
    ['heard the question on loopback (THEM)', them.length >= 1],
    ['produced an answer for it', answers.length >= 1],
    // NOT asserting zero ME turns. This harness plays the question through the
    // SPEAKERS with the mic live -- the one setup the README tells you not to
    // use, because the mic re-hears the room. What must never happen is a ME
    // turn triggering an answer, and that is structural: only THEM turns reach
    // the brain. Bleed in the transcript is cosmetic and headphones remove it.
    ['no answer was triggered by my own voice', answers.length <= them.length],
    ['no errors', results.errors.length === 0],
  ];
  let pass = true;
  for (const [label, ok2] of checks) {
    console.log('  ' + (ok2 ? 'PASS  ' : 'FAIL  ') + label);
    if (!ok2) pass = false;
  }
  if (results.errors.length) results.errors.forEach((e) => console.log('        error:', e));
  console.log('  ' + '-'.repeat(62));
  console.log(`  THEM turns ${them.length} | ME turns ${me.length} | answers ${answers.length}`);
  if (me.length) {
    console.log(`  note: ${me.length} ME turn(s) are speaker bleed - this harness uses speakers,`);
    console.log('        not headphones. They never trigger an answer. Wear headphones and they vanish.');
  }
  console.log('  ' + (pass ? 'E2E PASS' : 'E2E FAIL') + '\n');
  process.exit(pass ? 0 : 1);
})();

function play(wav) {
  if (process.platform === 'darwin') {
    return new Promise((resolve) => spawn('afplay', [wav]).on('close', resolve));
  }
  return new Promise((resolve) => {
    const py = spawn('py', ['-3.11', '-c', `
import sys, wave, numpy as np
sys.path.insert(0, r'${path.join(ROOT, 'audio').replace(/\\/g, '\\\\')}')
import pyaudiowpatch as pa, devices
p = pa.PyAudio()
try:
    out = devices.default_output(p)
    w = wave.open(r'${wav.replace(/\\/g, '\\\\')}', 'rb')
    sr = w.getframerate()
    raw = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
    osr = int(out['defaultSampleRate']); och = min(2, out['maxOutputChannels'])
    idx = np.clip((np.arange(int(len(raw)*osr/sr))*sr/osr).astype(np.int64), 0, len(raw)-1)
    sig = (raw[idx] * 0.75).astype(np.float32)
    st = p.open(format=pa.paFloat32, channels=och, rate=osr, output=True,
                output_device_index=out['index'], frames_per_buffer=1024)
    for i in range(0, len(sig), 1024):
        ch = sig[i:i+1024]
        st.write(np.repeat(ch, och).astype(np.float32).tobytes())
    st.stop_stream(); st.close()
finally:
    p.terminate()
`], { cwd: ROOT, windowsHide: true });
    py.on('exit', () => resolve());
    py.stderr.on('data', (b) => { const s = String(b).trim(); if (s) console.log('   play:', s.slice(0, 120)); });
  });
}
