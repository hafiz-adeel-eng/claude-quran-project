'use strict';
/**
 * The honest test.
 *
 * Google Meet and Zoom-in-browser capture the screen with
 * navigator.mediaDevices.getDisplayMedia(), which goes through WebRTC's desktop
 * capturer -- a DIFFERENT code path from Electron's main-process
 * desktopCapturer. So we drive getDisplayMedia from a real renderer, pull a
 * frame into a canvas, and read the pixels where each test window sits.
 *
 * Whatever this prints is what a person on the other end of the call sees.
 */

const { app, BrowserWindow, desktopCapturer, session, screen, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const cap = require('../src/main/win-capture');

const MARK = { r: 255, g: 0, b: 200 };

const markPage = 'data:text/html,' + encodeURIComponent(
  `<body style="margin:0;height:100vh;background:rgb(${MARK.r},${MARK.g},${MARK.b})"></body>`);

app.whenReady().then(async () => {
  const area = screen.getPrimaryDisplay().workArea;
  const W = 260, H = 200, Y = area.y + 320;

  const mk = async (i, label, apply) => {
    const X = area.x + 40 + i * (W + 20);
    const w = new BrowserWindow({
      x: X, y: Y, width: W, height: H, frame: false, transparent: false,
      alwaysOnTop: true, skipTaskbar: true, hasShadow: false, backgroundColor: '#000000',
    });
    w.setAlwaysOnTop(true, 'screen-saver');
    await w.loadURL(markPage);
    const info = apply ? apply(w) : { mode: 'none' };
    return { label, w, X, Y, info };
  };

  const wins = [];
  wins.push(await mk(0, 'setContentProtection', (w) => { w.setContentProtection(true); return { aff: cap.affinityOf(w) }; }));
  wins.push(await mk(1, 'WDA_EXCLUDEFROMCAPTURE', (w) => { const r = cap.hideFromCapture(w); return { ok: r.ok, aff: cap.affinityOf(w) }; }));
  wins.push(await mk(2, 'no protection (control)', null));

  console.log('');
  for (const x of wins) console.log('  ' + x.label.padEnd(24), JSON.stringify(x.info));

  // Auto-answer the screen picker with the whole screen, like a user sharing.
  session.defaultSession.setDisplayMediaRequestHandler(async (_req, cb) => {
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    cb({ video: sources[0] });
  }, { useSystemPicker: false });

  const probe = new BrowserWindow({
    x: area.x + 40, y: area.y + 40, width: 320, height: 90,
    alwaysOnTop: false, skipTaskbar: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  await probe.loadFile(path.join(__dirname, 'probe.html'));

  ipcMain.on('frame', (_e, m) => {
    if (m.error) { console.log('\n  getDisplayMedia failed:', m.error, '\n'); return app.exit(1); }

    const { w: cw, h: ch, buf } = m;
    const disp = screen.getPrimaryDisplay().size;
    const sx = cw / disp.width, sy = ch / disp.height;
    const near = (r, g, b, c, t = 30) => Math.abs(r - c.r) <= t && Math.abs(g - c.g) <= t && Math.abs(b - c.b) <= t;

    console.log('\n  getDisplayMedia frame:', cw + 'x' + ch);
    console.log('\n  variant                   mark px   black px   verdict');
    console.log('  ' + '-'.repeat(64));

    for (const r of wins) {
      let mark = 0, black = 0, total = 0;
      for (let y = Math.round(r.Y * sy); y < Math.round((r.Y + H) * sy); y++) {
        for (let x = Math.round(r.X * sx); x < Math.round((r.X + W) * sx); x++) {
          const i = (y * cw + x) * 4;
          if (i + 2 >= buf.length) continue;
          const R = buf[i], G = buf[i + 1], B = buf[i + 2];
          total++;
          if (near(R, G, B, MARK)) mark++;
          else if (R < 14 && G < 14 && B < 14) black++;
        }
      }
      if (!total) { console.log('  ' + r.label.padEnd(26) + 'offscreen'); continue; }
      const mp = mark / total * 100, bp = black / total * 100;
      const verdict = mp > 10 ? 'VISIBLE - leaks' : bp > 60 ? 'BLACK BOX - obvious' : 'INVISIBLE - correct';
      console.log('  ' + r.label.padEnd(26) + (mp.toFixed(1) + '%').padEnd(10) + (bp.toFixed(1) + '%').padEnd(11) + verdict);
    }

    // Save the frame so we can eyeball it.
    const png = Buffer.alloc(cw * ch * 4);
    for (let i = 0; i < cw * ch; i++) {
      png[i * 4] = buf[i * 4]; png[i * 4 + 1] = buf[i * 4 + 1];
      png[i * 4 + 2] = buf[i * 4 + 2]; png[i * 4 + 3] = 255;
    }
    const { nativeImage } = require('electron');
    fs.writeFileSync(path.join(__dirname, '..', 'data', 'capture-getdisplaymedia.png'),
      nativeImage.createFromBitmap(png, { width: cw, height: ch }).toPNG());
    console.log('\n  saved data/capture-getdisplaymedia.png\n');
    app.exit(0);
  });
});
