'use strict';
/* Serves the companion page, loads it at phone size, feeds it a realistic
   meeting, and saves a picture of what you would actually read. */
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path');
const { Companion } = require('../src/main/companion');

app.whenReady().then(async () => {
  const c = new Companion();
  const url = c.start(8901);
  console.log('  serving:', url);

  const win = new BrowserWindow({
    width: 400, height: 800, show: true, backgroundColor: '#07090e',
    webPreferences: { contextIsolation: true },
  });
  await win.loadURL(url);
  await new Promise(r => setTimeout(r, 1800));
  console.log('  connected clients:', c.connected);

  const wait = ms => new Promise(r => setTimeout(r, ms));
  c.send('state', { listening: true });
  for (const t of [
    { role: 'them', text: 'Hi, thanks for making the time today.' },
    { role: 'me',   text: 'Of course, happy to be here.' },
    { role: 'them', text: 'How would you approach scaling the payment service during a flash sale?' },
    { role: 'me',   text: 'Sure, the first thing I would look at is where the contention actually is.' },
    { role: 'them', text: 'And how would you handle idempotency of the checkout requests?' },
  ]) { c.send('turn', t); await wait(120); }

  const ANSWER = "I'd have the client send a unique idempotency key with each checkout request, "
    + "store it with the result, and return the original response on a retry. That way a repeat "
    + "never charges twice, even under load.";
  c.send('answer', { phase: 'start' });
  await wait(150);
  for (let i = 10; i <= ANSWER.length; i += 10) { c.send('answer', { phase: 'delta', full: ANSWER.slice(0, i) }); await wait(10); }
  c.send('answer', { phase: 'done', text: ANSWER, ms: 2380, skipped: false });
  c.send('suggest', { items: [
    'What does peak traffic look like today?',
    'Which part of checkout worries you most?',
    'Who owns the payment service internally?',
  ]});

  await wait(1200);
  const img = await win.webContents.capturePage();
  const out = path.join(__dirname, '..', 'data', 'phone-preview.png');
  fs.writeFileSync(out, img.toPNG());
  console.log('  saved', out);
  c.stop(); app.exit(0);
});
