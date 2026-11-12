'use strict';
/* Does forcing Windows Graphics Capture make an ENTIRE-SCREEN capture clean?
   If yes, the same feature flags in Chrome would fix Meet's screen share. */
const { app, BrowserWindow, desktopCapturer, session, screen, ipcMain, nativeImage } = require('electron');
const path = require('path'), fs = require('fs');
const cap = require('../src/main/win-capture');

const FLAGS = process.argv.slice(2).find(a => a.startsWith('--features='));
if (FLAGS) {
  const v = FLAGS.split('=').slice(1).join('=');
  app.commandLine.appendSwitch('enable-features', v);
  console.log('  forcing features:', v);
} else {
  console.log('  no feature flags (baseline)');
}

const MARK = { r: 255, g: 0, b: 200 };

app.whenReady().then(async () => {
  const area = screen.getPrimaryDisplay().workArea;
  const ov = new BrowserWindow({
    x: area.x + 380, y: area.y + 240, width: 380, height: 300,
    frame: false, transparent: false, alwaysOnTop: true, skipTaskbar: true,
    hasShadow: false, backgroundColor: '#0b0e14',
  });
  ov.setAlwaysOnTop(true, 'screen-saver');
  await ov.loadURL('data:text/html,' + encodeURIComponent(
    `<body style="margin:0;height:100vh;background:rgb(${MARK.r},${MARK.g},${MARK.b})"></body>`));
  cap.hideFromCapture(ov);
  ov.setOpacity(0.92);
  console.log('  affinity:', cap.affinityOf(ov));
  await new Promise(r => setTimeout(r, 2000));

  const sources = await desktopCapturer.getSources({ types: ['screen'] });
  session.defaultSession.setDisplayMediaRequestHandler((_q, cb) => cb({ video: sources[0] }),
    { useSystemPicker: false });

  const probe = new BrowserWindow({ x: area.x+20, y: area.y+20, width: 300, height: 80,
    skipTaskbar: true, webPreferences: { nodeIntegration: true, contextIsolation: false } });
  await probe.loadFile(path.join(__dirname, 'probe.html'));

  const f = await new Promise(res => {
    const h = (_e, m) => { ipcMain.removeListener('frame', h); res(m); };
    ipcMain.on('frame', h);
    setTimeout(() => { ipcMain.removeListener('frame', h); res({ error: 'timeout' }); }, 25000);
  });
  if (f.error) { console.log('  FAILED:', f.error); return app.exit(1); }

  const b = ov.getBounds();
  const sx = f.w / screen.getPrimaryDisplay().size.width;
  const sy = f.h / screen.getPrimaryDisplay().size.height;
  let dark = 0, mark = 0, total = 0;
  for (let y = Math.round(b.y*sy); y < Math.round((b.y+b.height)*sy); y++)
    for (let x = Math.round(b.x*sx); x < Math.round((b.x+b.width)*sx); x++) {
      const i = (y*f.w + x)*4; if (i+2 >= f.buf.length) continue;
      const R=f.buf[i], G=f.buf[i+1], B=f.buf[i+2]; total++;
      if (Math.abs(R-MARK.r)<=40 && Math.abs(G-MARK.g)<=40 && Math.abs(B-MARK.b)<=40) mark++;
      else if (R<40 && G<40 && B<40) dark++;
    }
  const dp = dark/total*100, mp = mark/total*100;
  console.log(`  inside the overlay rect: overlay ${mp.toFixed(1)}%  dark ${dp.toFixed(1)}%`);
  console.log('  RESULT:', mp > 5 ? 'LEAKS' : dp > 60 ? 'DARK BOX' : 'CLEAN - truly invisible');
  ov.destroy(); app.exit(0);
});
