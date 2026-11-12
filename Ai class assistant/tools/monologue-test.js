'use strict';
/* What happens when the other person talks continuously for a long time?
   Counts how the speech is split into turns and how many answers that would
   trigger. Brain runs in MOCK mode so this costs nothing and only measures the
   turn/trigger behaviour. */
const path = require('path');
const { spawn } = require('child_process');
const { AudioBridge } = require('../src/main/bridge');
const { Brain, needsAnswer } = require('../src/main/brain');
const { TurnBuffer } = require('../src/main/turnbuffer');
const store = require('../src/main/store');

const ROOT = path.join(__dirname, '..');

(async () => {
  const settings = store.getSettings();
  const brain = new Brain();
  const bridge = new AudioBridge();
  await brain.start({ title: 'monologue' }, { ...settings.brain, mock: true });

  const turns = [];
  let answers = 0, superseded = 0, gated = 0;
  let t0 = 0;

  brain.on('start', (s) => { if (s.kind === 'answer') answers++; });
  brain.on('superseded', () => superseded++);

  // Same buffer the app uses.
  const buf = new TurnBuffer({
    quietMs: 900,
    maxWaitMs: 60000,
    onFlush: (text, info) => {
      flushes.push({ text, parts: info.parts, interim: info.interim });
      console.log(`
  >>> ANSWER after ${info.parts} sentence(s)${info.interim ? ' [interim safety valve]' : ''}, ${text.split(/\s+/).length} words`);
      if (needsAnswer(text)) brain.answer(text, []); else gated++;
    },
  });
  const flushes = [];

  bridge.on('event', (m) => {
    if (m.t === 'level') { buf.noteLevel(m.them); return; }
    if (m.t !== 'final' || m.role !== 'them') return;
    const now = Date.now();
    const gap = t0 ? now - t0 : 0;
    t0 = now;
    turns.push({ gap, words: m.text.trim().split(/\s+/).length, text: m.text });
    console.log(`  +${(gap / 1000).toFixed(1)}s  ${String(m.text.trim().split(/\s+/).length).padStart(3)}w  ${m.text.slice(0, 68)}`);
    buf.push(m.text);
  });

  const terms = ['idempotency', 'checkout', 'Postgres', 'flash sale'];
  const audioCfg = { ...settings.audio, cloud: { ...settings.audio.cloud, keywords: terms } };
  await bridge.start(audioCfg);
  await new Promise((r) => setTimeout(r, settings.audio.backend === 'cloud' ? 9000 : 24000));
  console.log('  playing 95 seconds of continuous speech…\n');

  await new Promise((resolve) => {
    const py = spawn('py', ['-3.11', path.join(__dirname, 'play.py'),
                            path.join(ROOT, 'data', 'long.wav')],
                     { cwd: ROOT, windowsHide: true });
    py.on('exit', resolve);
  });

  await new Promise((r) => setTimeout(r, 8000));
  await bridge.stop(); await brain.stop();

  const gaps = turns.map((t) => t.gap).slice(1);
  console.log('\n  ' + '-'.repeat(64));
  console.log('  turns from 95s of continuous speech :', turns.length);
  console.log('  total words                         :', turns.reduce((a, t) => a + t.words, 0));
  console.log('  gap between turns (s)               : min', (Math.min(...gaps)/1000).toFixed(1),
              '| median', (gaps.sort((a,b)=>a-b)[Math.floor(gaps.length/2)]/1000).toFixed(1),
              '| max', (Math.max(...gaps)/1000).toFixed(1));
  console.log('  ANSWERS TRIGGERED                   :', answers, '  <-- was 8 before buffering');
  console.log('  sentences merged per answer         :', flushes.map((f) => f.parts).join(', '));
  console.log('  answers thrown away (superseded)    :', superseded);
  console.log('  turns gated out (no answer needed)  :', gated);
  console.log('  ' + '-'.repeat(64));
  process.exit(0);
})();
