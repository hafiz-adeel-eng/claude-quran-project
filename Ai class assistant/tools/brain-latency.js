'use strict';
/**
 * Measures the real in-meeting delay using the actual Brain class, so the
 * numbers include pre-warm, the answer gate, and the live system prompt.
 *
 * Run:  node tools/brain-latency.js
 */

const { Brain } = require('../src/main/brain');
const store = require('../src/main/store');

const BRIEF = {
  title: 'Backend role interview',
  kind: 'interview',
  company: 'a fintech',
  role: 'senior backend developer',
  otherSide: 'their engineering lead',
  goal: 'show I can design payment systems',
  background: 'I have built payment and checkout systems, mostly Node and Postgres, ' +
              'including a flash-sale system that handled 3x normal traffic.',
  terms: ['idempotency', 'checkout', 'database contention', 'flash sale'],
};

const TURNS = [
  'So tell me, how would you approach scaling the payment service when traffic triples during a flash sale?',
  'And how would you handle idempotency of the checkout requests?',
  'What about the database contention you mentioned?',
];

(async () => {
  const settings = store.getSettings();
  console.log('');
  console.log('  live model :', settings.brain.model, ' | prep/summary:', settings.brain.deepModel);
  console.log('  ' + '-'.repeat(66));

  const brain = new Brain();
  const rows = [];
  let cur = null;

  brain.on('status', (s) => {
    if (s.warming === true) console.log('  pre-warming the session…');
    if (s.warming === false) console.log(`  warm after ${(s.warmedInMs / 1000).toFixed(1)}s (this happens while you set up, not mid-call)`);
  });
  brain.on('start', (s) => { cur = { id: s.id, t0: Date.now(), ttft: 0 }; });
  brain.on('delta', (d) => { if (cur && d.id === cur.id && !cur.ttft) cur.ttft = Date.now() - cur.t0; });

  const t0 = Date.now();
  await brain.start(BRIEF, settings.brain);

  // Wait for pre-warm to finish before timing anything.
  await new Promise((r) => {
    const done = () => { brain.off('status', h); r(); };
    const h = (s) => { if (s.warming === false) done(); };
    brain.on('status', h);
    setTimeout(done, 60000);
  });
  console.log(`  session ready in ${((Date.now() - t0) / 1000).toFixed(1)}s total`);
  console.log('  ' + '-'.repeat(66));

  for (let i = 0; i < TURNS.length; i++) {
    const answer = await new Promise((resolve) => {
      const onDone = (d) => {
        if (d.kind !== 'answer') return;
        brain.off('done', onDone);
        resolve(d);
      };
      brain.on('done', onDone);
      brain.answer(TURNS[i], []);
    });

    rows.push({ ttft: cur ? cur.ttft : 0, total: answer.ms, words: answer.text.split(/\s+/).length });
    console.log(`  Q${i + 1}: first word ${cur.ttft} ms | complete ${answer.ms} ms | ${answer.text.split(/\s+/).length} words`);
    console.log(`      "${answer.text.slice(0, 92)}${answer.text.length > 92 ? '…' : ''}"`);
  }

  await brain.stop();

  const avg = (k) => Math.round(rows.reduce((a, r) => a + r[k], 0) / rows.length);
  console.log('  ' + '-'.repeat(66));
  console.log(`  average: first word ${avg('ttft')} ms | full answer ${avg('total')} ms`);
  console.log('');
  console.log('  Real in-meeting delay after they stop talking:');
  console.log(`    0.6 s  silence detection`);
  console.log(`  + ~2.5 s transcription (tiny.en at 0.5x on a 5 s question)`);
  console.log(`  + ${(avg('ttft') / 1000).toFixed(1)} s  first words appear`);
  console.log(`  = about ${(3.1 + avg('ttft') / 1000).toFixed(1)} s before you can start speaking`);
  console.log('');
  process.exit(0);
})();
