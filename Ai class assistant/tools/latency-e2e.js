'use strict';
/**
 * The only latency number that matters: from the moment the other person STOPS
 * TALKING to the moment readable words are on the overlay.
 *
 * Everything else in docs/BENCHMARKS.md is a component measurement. This is the
 * whole chain, wall-clock, end to end:
 *
 *   playback ends -> VAD calls the sentence finished -> Whisper -> Claude first
 *   token -> Claude finishes
 *
 * Run:  node tools/latency-e2e.js
 */

const path = require('path');
const { spawn } = require('child_process');

const { AudioBridge } = require('../src/main/bridge');
const { Brain } = require('../src/main/brain');
const { TurnBuffer } = require('../src/main/turnbuffer');
const store = require('../src/main/store');

const ROOT = path.join(__dirname, '..');
const marks = [];
let playbackEndedAt = 0;

function log(...a) { console.log('  ', ...a); }

(async () => {
  const settings = store.getSettings();
  log('speech backend :', settings.audio.backend, '/', settings.audio.final_model);
  log('live brain     :', settings.brain.model);
  log('');

  const brain = new Brain();
  const bridge = new AudioBridge();
  let firstTokenAt = 0;
  let ready = false;

  brain.on('delta', () => { if (!firstTokenAt) firstTokenAt = Date.now(); });
  brain.on('done', (d) => {
    const m = marks[marks.length - 1];
    if (!m || m.done) return;
    m.firstTokenAt = firstTokenAt;
    m.completeAt = Date.now();
    m.words = String(d.text || '').trim().split(/\s+/).length;
    m.done = true;
  });

  await brain.start({ title: 'latency', terms: ['idempotency', 'checkout'] }, settings.brain);

  bridge.on('log', (l) => { if (/error|Error|Traceback/.test(l)) log('sidecar:', l.slice(0, 140)); });
  bridge.on('fatal', (m) => log('FATAL:', m));
  // Same buffering the app does: hold sentences until they stop talking.
  const buf = new TurnBuffer({ maxWaitMs: 60000,
    onFlush: (text) => { firstTokenAt = 0; brain.answer(text, []); } });

  bridge.on('event', (m) => {
    if (m.t === 'level') buf.noteLevel(m.them);
    if (m.t === 'status') {
      log('status:', m.stage, m.device || m.took || '');
      if (m.stage === 'models_ready') ready = true;
    }
    if (m.t === 'error') log('ERROR:', m.where, m.msg);
    if (m.t === 'lag') log('lag depth', m.depth);
    if (m.t === 'devices') log('hearing:', m.loopback, '| mic:', m.mic);
    if (m.t === 'final' && m.role === 'me') log('(me):', String(m.text).slice(0, 50));
    if (m.t === 'final' && m.role === 'them') {
      // Record ABSOLUTE arrival time. Streaming returns the final within ~0.2 s
      // of the speaker stopping, which can beat the main thread's assignment of
      // playbackEndedAt -- comparing live would silently discard the very result
      // we are trying to measure.
      const mk = {
        arrivedAt: Date.now(),
        rtf: m.rtf, dur: m.dur, text: m.text,
      };
      marks.push(mk);
      firstTokenAt = 0;
      log(`heard: "${m.text}"`);
      buf.push(m.text);
    }
  });

  log('starting audio…');
  const terms = ['idempotency', 'checkout', 'database contention', 'flash sale'];
  const audioCfg = { ...settings.audio, cloud: { ...settings.audio.cloud, keywords: terms } };
  const ok = await bridge.start(audioCfg);
  if (!ok) { console.log('FAILED:', bridge.lastError); process.exit(1); }
  // Wait for the engine to actually say it is ready, rather than guessing.
  // A fixed delay played the question before the sidecar had opened the audio.
  for (let i = 0; i < 120 && !ready; i++) await new Promise((r) => setTimeout(r, 500));
  await new Promise((r) => setTimeout(r, 2500));   // let the capture settle
  bridge.setHotwords(terms);
  await new Promise((r) => setTimeout(r, 800));

  log('playing a question through the speakers…');
  await play(path.join(ROOT, 'data', 'bench.wav'));
  playbackEndedAt = Date.now();
  log('they stopped talking - clock starts now');
  log('');

  await new Promise((r) => setTimeout(r, 30000));
  await bridge.stop();
  await brain.stop();

  // The LAST utterance is the one that truly ends when playback ends.
  const done = marks.filter((m) => m.done);
  console.log('  ' + '-'.repeat(64));
  if (!done.length) {
    console.log('  no answer was produced.');
    process.exit(1);
  }
  const last = done[done.length - 1];
  const rel = (t) => ((t - playbackEndedAt) / 1000).toFixed(1);
  console.log('  REAL DELAY, measured from the moment they stopped talking:');
  console.log(`    transcript ready ${rel(last.arrivedAt)} s`);
  console.log(`    words on screen  ${rel(last.firstTokenAt)} s   <-- when you can start speaking`);
  console.log(`    full answer      ${rel(last.completeAt)} s   (${last.words} words)`);
  console.log('  ' + '-'.repeat(64));
  process.exit(0);
})();

function play(wav) {
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
  });
}
