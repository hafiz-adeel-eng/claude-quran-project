'use strict';
/* Creates a window titled exactly like Chrome's screen-share indicator, so the
   running app's share watcher should react to it. Then reports whether the
   Meeting Copilot overlay actually became hidden. */
const { app, BrowserWindow } = require('electron');
const { detectShare } = require('../src/main/sharewatch');
const { visibleTitles } = require('../src/main/sharewatch');

app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: 420, height: 60, x: 40, y: 40, show: true,
    title: 'placeholder', skipTaskbar: false });
  await w.loadURL('data:text/html,' + encodeURIComponent('<title>x</title><body style="background:#eee">fake share indicator</body>'));
  w.setTitle('meet.google.com is sharing your screen.');
  await new Promise(r => setTimeout(r, 800));

  console.log('  detectShare now:', JSON.stringify(detectShare()));
  console.log('  waiting 8s for the app to react...');

  const seen = [];
  for (let i = 0; i < 8; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const titles = visibleTitles();
    seen.push(titles.includes('Meeting Copilot'));
  }
  console.log('  overlay window visible each second:', seen.map(v => v ? 'Y' : '-').join(' '));
  console.log('');
  console.log(seen[seen.length - 1]
    ? '  RESULT: overlay is STILL VISIBLE -> auto-hide did not fire'
    : '  RESULT: overlay disappeared -> auto-hide works');
  w.destroy();
  app.exit(0);
});
