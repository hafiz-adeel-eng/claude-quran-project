'use strict';
/* Does the answer actually draw on the prepared material in the brief?
   Replays real questions and reports word overlap against the brief, plus a
   check that no private note was read aloud. */
const fs = require('fs');
const { Brain } = require('../src/main/brain');
const store = require('../src/main/store');

const STOP = new Set(('the a an and or but so to of for with from in on at is are was were be been have has had ' +
  'i you we they it that this what how why when where can could would should will do does did my our your their ' +
  'me us them not no yes if as by about into over then than there here just like really very').split(' '));

function keywords(s) {
  return new Set(String(s).toLowerCase().replace(/[^a-z0-9\s']/g, ' ').split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w)));
}

(async () => {
  const m = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const settings = store.getSettings();
  const bg = m.brief.background || '';
  const bgWords = keywords(bg);

  // Private lines that must never be spoken.
  const secrets = bg.split('\n').map((l) => l.trim())
    .filter((l) => /never read|private reminder|don'?t say|do not say|stop here|let .* talk/i.test(l));

  const brain = new Brain();
  const done = [];
  brain.on('done', (d) => done.push(d.text || ''));
  await brain.start(m.brief, settings.brain);

  const them = m.transcript.filter((t) => t.role === 'them');
  const picks = them.filter((t) => t.text.split(/\s+/).length >= 12).slice(2, 5);

  for (const q of picks) {
    const i = m.transcript.indexOf(q);
    const ctx = m.transcript.slice(Math.max(0, i - 24), i).map((t) => ({ role: t.role, text: t.text }));
    const before = done.length;
    brain.answer(q.text, ctx);
    await new Promise((r) => {
      const iv = setInterval(() => { if (done.length > before) { clearInterval(iv); r(); } }, 200);
      setTimeout(() => { clearInterval(iv); r(); }, 45000);
    });
    const a = (done[done.length - 1] || '').trim();
    const aw = keywords(a);
    const shared = [...aw].filter((w) => bgWords.has(w));
    const pct = aw.size ? Math.round(shared.length / aw.size * 100) : 0;
    const leaked = secrets.filter((sline) => sline.length > 25 && a.toLowerCase().includes(sline.toLowerCase().slice(0, 25)));

    console.log('  THEY : ' + q.text.slice(0, 96));
    console.log(`  SAY  (${a.split(/\s+/).length}w, ${pct}% of its content words come from your brief): ${a.slice(0, 210)}`);
    if (leaked.length) console.log('  *** LEAKED A PRIVATE NOTE:', leaked[0].slice(0, 60));
    console.log('');
  }
  console.log('  ' + '-'.repeat(62));
  console.log('  (in the real meeting only 1 of 166 prepared lines was used at all)');
  await brain.stop();
  process.exit(0);
})();
