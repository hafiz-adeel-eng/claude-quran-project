'use strict';
/* Replays real questions from a saved meeting through the CURRENT prompt and
   settings, so answer length and relevance can be judged against what actually
   happened rather than a synthetic example. */
const fs = require('fs'), path = require('path');
const { Brain } = require('../src/main/brain');
const store = require('../src/main/store');

const file = process.argv[2];
(async () => {
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  const settings = store.getSettings();
  console.log('  model    :', settings.brain.model);
  console.log('  maxWords :', settings.brain.maxWords);
  console.log('  brief    :', (m.brief.background || '').length, 'chars of background\n');

  const brain = new Brain();
  const out = [];
  let cur = null;
  brain.on('start', () => { cur = { text: '' }; });
  brain.on('delta', (d) => { if (cur) cur.text = d.full; });
  brain.on('done', (d) => { out.push(d.text || ''); });

  await brain.start(m.brief, settings.brain);

  // Real substantive things she said, with the conversation up to that point.
  const them = m.transcript.filter((t) => t.role === 'them');
  const picks = them.filter((t) => t.text.includes('?') && t.text.split(/\s+/).length >= 10).slice(0, 3);

  for (const q of picks) {
    const i = m.transcript.indexOf(q);
    const ctx = m.transcript.slice(Math.max(0, i - 24), i).map((t) => ({ role: t.role, text: t.text }));
    const before = out.length;
    brain.answer(q.text, ctx);
    await new Promise((r) => {
      const iv = setInterval(() => { if (out.length > before) { clearInterval(iv); r(); } }, 200);
      setTimeout(() => { clearInterval(iv); r(); }, 45000);
    });
    const a = out[out.length - 1] || '(none)';
    console.log('  THEY: ' + q.text.slice(0, 110));
    console.log(`  SAY  (${a.trim().split(/\s+/).length} words): ${a}`);
    console.log('');
  }

  const lens = out.filter(Boolean).map((a) => a.trim().split(/\s+/).length);
  if (lens.length) {
    console.log('  ' + '-'.repeat(60));
    console.log('  answer length now:', lens.join(', '), 'words');
    console.log('  (in the real meeting the median was 23 words)');
  }
  await brain.stop();
  process.exit(0);
})();
