'use strict';
/**
 * Renders the overlay with realistic data and saves a picture of it.
 *
 * Needed because the overlay is excluded from screen capture on purpose -- a
 * normal screenshot shows a dark rectangle, so it cannot be used to check the
 * layout. webContents.capturePage() reads the renderer's own output instead,
 * which is not affected by display affinity.
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

const TURNS = [
  { role: 'them', text: 'Hi, thanks for making the time today.' },
  { role: 'me', text: 'Of course, happy to be here.' },
  { role: 'them', text: 'So tell me, how would you approach scaling the payment service when traffic triples during a flash sale?' },
  { role: 'me', text: 'Sure, so the first thing I would look at is where the contention actually is.' },
  { role: 'them', text: 'And how would you handle idempotency of the checkout requests?' },
];

let ANSWER = "I would make every checkout request carry a unique key so retries never double charge, and settle the hot rows asynchronously so the write path never blocks. I would make every checkout request carry a unique key so retries never double charge, and settle the hot rows asynchronously so the write path never blocks. I would make every checkout request carry a unique key so retries never double charge, and settle the hot rows asynchronously so the write path never blocks. I would make every checkout request carry a unique key so retries never double charge, and settle the hot rows asynchronously so the write path never blocks. I would make every checkout request carry a unique key so retries never double charge, and settle the hot rows asynchronously so the write path never blocks. I would make every checkout request carry a unique key so retries never double charge, and settle the hot rows asynchronously so the write path never blocks. ";

const SUGGESTIONS = [
  'What does peak traffic actually look like today?',
  'Which part of checkout worries you most right now?',
  'Who owns the payment service internally?',
];

// README=1 draws the screenshot used in the README: the same made-up meeting
// as the dashboard pictures, with a realistic single answer. The default above
// is deliberately long, to prove the answer panel scrolls.
if (process.env.README) {
  TURNS.length = 0;
  TURNS.push(
    { role: 'them', text: 'Thanks for coming on. So our website is pretty old now.' },
    { role: 'me', text: 'Happy to help. I had a look at it before the call.' },
    { role: 'them', text: 'How long would a new one take, and what would it cost us?' },
  );
  ANSWER = 'About two weeks from the day we agree the pages. The rebuild is 1,200, and if you '
    + 'want me to keep the local search side growing after launch, that is 300 a month, with no '
    + 'lock-in. For a cafe I rebuilt last year, calls went from about 40 to 170 a month.';
  SUGGESTIONS.length = 0;
  SUGGESTIONS.push('Which shop gets the most phone orders today?',
    'Who will write the product descriptions?', 'Is there a date you need it live by?');
}


app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 520, height: 620, show: true, frame: false,
    transparent: false, backgroundColor: '#0b0e14', hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload', 'overlay.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });

  // The preload calls these on boot; answer them so the UI settles.
  ipcMain.handle('state', () => ({
    listening: true, opacity: 0.92, clickThrough: false, mock: false, authError: null,
  }));
  for (const ch of ['overlay:size', 'overlay:opacity', 'overlay:clickThrough', 'overlay:hide',
                    'dashboard:open', 'brain:ask', 'brain:repeat', 'note:add']) {
    ipcMain.handle(ch, () => true);
  }

  await win.loadFile(path.join(__dirname, '..', 'src', 'overlay', 'index.html'));
  const wc = win.webContents;
  const send = (ch, p) => wc.send(ch, p);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  await wait(700);
  send('devices', { loopback: 'Speakers (Realtek Audio) [Loopback]', mic: 'Microphone (USB Headset)' });
  send('status', { stage: 'models_ready', took: 4.1 });
  send('level', { them: 0.06, me: 0.004 });

  for (const t of TURNS) { send('turn', t); await wait(140); }

  send('answer:start', { id: 1, kind: 'answer' });
  await wait(200);
  for (let i = 8; i <= ANSWER.length; i += 8) {
    send('answer:delta', { id: 1, kind: 'answer', text: '', full: ANSWER.slice(0, i) });
    await wait(8);
  }
  send('answer:done', { id: 1, kind: 'answer', text: ANSWER, ms: 1840, skipped: false });

  send('answer:start', { id: 2, kind: 'suggest' });
  send('answer:done', { id: 2, kind: 'suggest', text: SUGGESTIONS.join('\n'), ms: 900, skipped: false });

  // Drag regions cannot be seen in a picture, so assert them directly.
  const regions = await wc.executeJavaScript(`
    (() => {
      const q = (sel) => {
        const el = document.querySelector(sel);
        return el ? getComputedStyle(el).webkitAppRegion || getComputedStyle(el)['-webkit-app-region'] : 'missing';
      };
      return {
        shell: q('#shell'), bar: q('#bar'), feed: q('#feed'),
        answerWrap: q('#answerWrap'), suggests: q('#suggests'), foot: q('#foot'),
        answerText: q('#answer'), askInput: q('#ask'),
        hideBtn: q('#hide'), copyBtn: q('#copyAnswer'), opacity: q('#opacity'),
      };
    })()
  `);
  console.log('  --- window drag regions ---');
  const wantDrag = ['shell','bar','feed','answerWrap','suggests','foot'];
  const wantNoDrag = ['answerText','askInput','hideBtn','copyBtn','opacity'];
  let bad = 0;
  for (const k of wantDrag) {
    const ok = regions[k] === 'drag';
    if (!ok) bad++;
    console.log('   ' + (ok ? 'drag  ' : 'BAD   ') + k.padEnd(12) + regions[k]);
  }
  for (const k of wantNoDrag) {
    const ok = regions[k] === 'no-drag';
    if (!ok) bad++;
    console.log('   ' + (ok ? 'click ' : 'BAD   ') + k.padEnd(12) + regions[k]);
  }
  console.log('  ' + (bad ? bad + ' WRONG' : 'all drag regions correct'));
  console.log('');

  // Prove the answer panel actually scrolls under a REAL mouse wheel.
  //
  // A synthetic WheelEvent from dispatchEvent does NOT scroll anything -- the
  // browser only performs default actions for TRUSTED events, so that test
  // reported a failure on a panel that was fine. sendInputEvent goes through
  // Electron's real input pipeline, which is what the user's mouse does.
  win.show(); win.focus();
  await wait(400);

  const geom = await wc.executeJavaScript(`
    (() => {
      const el = document.getElementById('answer');
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      el.scrollTop = 0;
      return {
        x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
        region: cs.webkitAppRegion || 'none',
        clientH: el.clientHeight, scrollH: el.scrollHeight,
      };
    })()
  `);

  const wheel = async (deltaY) => {
    wc.sendInputEvent({ type: 'mouseWheel', x: geom.x, y: geom.y,
                        deltaX: 0, deltaY, canScroll: true });
    await wait(320);
    return wc.executeJavaScript("document.getElementById('answer').scrollTop");
  };

  const top0 = await wc.executeJavaScript("document.getElementById('answer').scrollTop");
  const down = await wheel(-150);          // wheel toward the user = scroll down
  const back = await wheel(150);           // and back up

  const overflows = geom.scrollH > geom.clientH + 2;
  console.log('  --- ANSWER SCROLLBAR CHECK (real wheel) ---');
  console.log('   needs scrolling   :', overflows, '(' + geom.scrollH + 'px text in a ' + geom.clientH + 'px panel)');
  console.log('   mouse reaches it  :', geom.region === 'no-drag' ? 'yes' : 'NO - drag region eats it');
  console.log('   started at top    :', top0 === 0);
  console.log('   WHEEL DOWN        : scrollTop ' + top0 + ' -> ' + down, down > top0 ? 'moved' : 'STUCK');
  console.log('   WHEEL UP          : scrollTop ' + down + ' -> ' + back, back < down ? 'moved back' : 'STUCK');
  const ok = overflows && geom.region === 'no-drag' && down > top0 && back < down;
  console.log('');
  console.log('   ' + (ok ? 'PASS - wheel scrolls the answer up and down' : 'FAIL - still stuck'));
  console.log('');

  await wait(1500);
  win.show(); win.focus();
  await wait(900);
  let img = await wc.capturePage();
  if (img.isEmpty()) {            // compositor had not produced a frame yet
    await wait(1500);
    img = await wc.capturePage();
  }
  console.log('  capture size:', JSON.stringify(img.getSize()), 'empty:', img.isEmpty());
  const out = path.join(__dirname, '..', 'data', 'overlay-preview.png');
  fs.writeFileSync(out, img.toPNG());
  console.log('  saved', out);
  app.exit(0);
});
