'use strict';
const { exportMeeting } = require('../src/main/docx');
const m = {
  id: 'testrun', createdAt: new Date().toISOString(),
  brief: { title: 'Discovery call - Brightside Bakery', kind: 'client call', company: 'Brightside Bakery',
           role: 'web designer', otherSide: 'Sam, the owner', goal: 'agree a website rebuild' },
  summary: { summary: 'Sam wants a mobile friendly site before the holiday season and is open to monthly SEO.',
    keyPoints: ['Three shops, one website from 2015', 'Most orders come by phone'],
    decisions: ['Start with the website rebuild'],
    actionItems: [{ who: 'me', what: 'Send the proposal and timeline', due: 'Friday' },
                  { who: 'them', what: 'Share the Google Business Profile login', due: '' }],
    questionsRaised: ['Who writes the product descriptions?'],
    followUp: 'Thanks for your time, Sam - the proposal is on its way by Friday.' },
  notes: [{ text: 'They sounded worried about downtime.' }],
  transcript: [
    { role: 'them', text: 'So how would you approach the new website?' },
    { role: 'me', text: 'I would start with what your customers search for, then build around that.' },
    { role: 'them', text: 'And how long does that take?' },
  ],
};
exportMeeting(m).then((r) => {
  console.log(r.ok ? '  docx written: ' + r.path : '  FAILED: ' + r.error);
  if (r.ok) {
    const st = require('fs').statSync(r.path);
    console.log('  size:', st.size, 'bytes');
    // A .docx is a zip: first two bytes must be PK.
    const fd = require('fs').openSync(r.path, 'r');
    const b = Buffer.alloc(2); require('fs').readSync(fd, b, 0, 2, 0); require('fs').closeSync(fd);
    console.log('  valid zip container:', b.toString() === 'PK');
  }
  process.exit(r.ok ? 0 : 1);
});
