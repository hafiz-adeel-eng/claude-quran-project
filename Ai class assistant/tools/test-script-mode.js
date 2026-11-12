'use strict';
/**
 * The prepared material has to behave like a skill:
 *
 *   MODE 1 - a question the script covers -> say the prepared line, near verbatim.
 *   MODE 2 - a question it does NOT cover -> answer from inside the script's facts,
 *            and refuse to invent anything outside them.
 *
 * The brief below deliberately contains specific, checkable facts and one obvious
 * trap: nothing about Instagram, so a question about Instagram must NOT produce a
 * confident made-up answer.
 */

const { Brain } = require('../src/main/brain');
const store = require('../src/main/store');

const BRIEF = {
  kind: 'client call', company: 'Studio Verde', role: 'Etsy growth specialist',
  otherSide: 'Maria, the shop owner', goal: 'get hired to manage the shop',
  background: [
    '1. OPENING',
    '▶ SAY',
    '"Hi Maria, really good to finally meet you. I had a proper look through Studio Verde before today."',
    'NOTE - DON\'T SAY',
    'She is nervous about cost. Do not mention price until she raises it.',
    '',
    '2. WHAT I FOUND',
    '▶ SAY',
    '"Your photography is genuinely strong, but your titles are doing almost none of the work.',
    'Right now they read like product names, not like what a buyer actually types into Etsy."',
    '',
    '3. WHAT I WOULD DO FIRST',
    '▶ SAY',
    '"I would start with the 12 listings that already get views but no sales, and rewrite the',
    'titles and tags around real buyer search terms. That is usually where the fastest lift is."',
    '',
    '4. PRICING',
    '▶ SAY',
    '"It is 450 dollars a month, and that covers listing optimisation, keyword research and a',
    'monthly report. No lock-in, month to month."',
    '',
    '5. TIMELINE',
    '▶ SAY',
    '"You would usually see movement in search position within 3 to 4 weeks, and sales follow',
    'a few weeks after that."',
  ].join('\n'),
  terms: ['Studio Verde', 'Etsy'],
};

const TESTS = [
  { mode: 1, q: 'So what did you actually find when you looked at my shop?',
    expect: [/titles/i, /photograph/i], reject: [] },
  { mode: 1, q: 'Okay, and what would this cost me each month?',
    expect: [/450/], reject: [] },
  { mode: 1, q: 'How long before I see anything happen?',
    expect: [/3\s*(to|-)\s*4 weeks|three to four weeks/i], reject: [] },
  // Not in the script at all. Must stay grounded / defer, not invent.
  { mode: 2, q: 'Would you also run my Instagram and post reels for me every week?',
    expect: [], reject: [/\bI (will|can|would) (run|manage|handle) (your )?instagram/i, /\breels\b.*\bincluded\b/i] },
  // Reject only an AFFIRMATIVE promise. "I can't guarantee that" is the correct
  // answer here, and an earlier version of this test wrongly failed it simply
  // for containing the word "guarantee".
  { mode: 2, q: 'Do you guarantee I will double my sales in two months?',
    expect: [/can'?t guarantee|cannot guarantee|no guarantee|can'?t promise|would not promise/i],
    reject: [/\b(yes,? I guarantee|I guarantee (you|that)|you will double|we will double)\b/i] },
];

(async () => {
  const settings = store.getSettings();
  const brain = new Brain();
  const done = [];
  brain.on('done', (d) => done.push(d.text || ''));
  await brain.start(BRIEF, settings.brain);
  await new Promise((r) => setTimeout(r, 1500));   // let the warm-up finish

  let fails = 0;
  for (const t of TESTS) {
    const before = done.length;
    brain.answer(t.q, []);
    await new Promise((r) => {
      const iv = setInterval(() => { if (done.length > before) { clearInterval(iv); r(); } }, 200);
      setTimeout(() => { clearInterval(iv); r(); }, 45000);
    });
    const a = (done[done.length - 1] || '').trim();

    const missing = t.expect.filter((re) => !re.test(a));
    const invented = t.reject.filter((re) => re.test(a));
    const ok = !missing.length && !invented.length;
    if (!ok) fails++;

    console.log(`  MODE ${t.mode}  ${ok ? 'PASS' : 'FAIL'}`);
    console.log('    Q: ' + t.q);
    console.log('    A: ' + a.slice(0, 165) + (a.length > 165 ? '…' : ''));
    if (missing.length) console.log('    !! did not use the prepared fact: ' + missing[0]);
    if (invented.length) console.log('    !! INVENTED something outside the brief: ' + invented[0]);
    console.log('');
  }

  console.log('  ' + '-'.repeat(58));
  console.log(fails ? `  ${fails} of ${TESTS.length} FAILED` : `  ALL ${TESTS.length} PASS`);
  await brain.stop();
  process.exit(fails ? 1 : 0);
})();
