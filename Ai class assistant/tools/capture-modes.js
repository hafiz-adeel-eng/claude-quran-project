'use strict';
/**
 * Which Meet/Zoom share mode actually hides the overlay on THIS machine?
 *
 * Chrome offers three: entire screen, a window, a tab. They use different
 * capture paths, and on a GPU without Windows Graphics Capture they behave
 * differently. This drives the real getDisplayMedia API for each and counts the
 * overlay's pixels in the resulting frame.
 *
 * Run:  node_modules\electron\dist\electron.exe tools/capture-modes.js
 */

const { app, BrowserWindow, desktopCapturer, session, screen, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const cap = require('../src/main/win-capture');

const MARK = { r: 255, g: 0, b: 200 };   // the "overlay"

app.whenReady().then(async () => {
  const area = screen.getPrimaryDisplay().workArea;

  // Stand-in for the overlay: opaque + translucent + excluded from capture,
  // exactly how main.js builds the real one.
  const overlay = new BrowserWindow({
    x: area.x + 380, y: area.y + 240, width: 380, height: 300,
    frame: false, transparent: false, alwaysOnTop: true, skipTaskbar: true,
    hasShadow: false, backgroundColor: '#0b0e14',
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  await overlay.loadURL('data:text/html,' + encodeURIComponent(
    `<body style="margin:0;height:100vh;background:rgb(${MARK.r},${MARK.g},${MARK.b})"></body>`));
  const info = cap.hideFromCapture(overlay);
  overlay.setOpacity(0.92);
  console.log('\n  overlay affinity:', cap.affinityOf(overlay), '| mode:', info.mode);

  await new Promise((r) => setTimeout(r, 2000));

  const results = {};

  async function grab(label, pick) {
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
    const src = pick(sources);
    if (!src) { console.log(`  ${label.padEnd(22)} (no source found)`); return; }

    session.defaultSession.setDisplayMediaRequestHandler((_req, cb) => cb({ video: src }),
      { useSystemPicker: false });

    const probe = new BrowserWindow({
      x: area.x + 20, y: area.y + 20, width: 300, height: 80, skipTaskbar: true,
      webPreferences: { nodeIntegration: true, contextIsolation: false },
    });
    await probe.loadFile(path.join(__dirname, 'probe.html'));

    const frame = await new Promise((resolve) => {
      const h = (_e, m) => { ipcMain.removeListener('frame', h); resolve(m); };
      ipcMain.on('frame', h);
      setTimeout(() => { ipcMain.removeListener('frame', h); resolve({ error: 'timeout' }); }, 25000);
    });
    probe.destroy();

    if (frame.error) { console.log(`  ${label.padEnd(22)} failed: ${frame.error}`); return; }

    const { w, h, buf } = frame;
    let mark = 0, dark = 0;
    for (let i = 0; i < buf.length; i += 4) {
      const R = buf[i], G = buf[i + 1], B = buf[i + 2];
      if (Math.abs(R - MARK.r) <= 40 && Math.abs(G - MARK.g) <= 40 && Math.abs(B - MARK.b) <= 40) mark++;
      else if (R < 40 && G < 40 && B < 40) dark++;
    }
    const total = w * h;
    const overlayArea = 380 * 300;
    const darkPct = (dark / total) * 100;
    const markPct = (mark / total) * 100;
    // Is there a dark blob roughly the size of the overlay?
    const blob = dark > overlayArea * 0.4 * (total / (area.width * area.height));
    results[label] = { markPct, darkPct, blob };
    console.log(`  ${label.padEnd(22)} frame ${w}x${h} | overlay pixels ${markPct.toFixed(1)}% | dark ${darkPct.toFixed(1)}% -> ` +
      (markPct > 1 ? 'VISIBLE - leaks' : blob ? 'DARK BOX where it sits' : 'CLEAN - nothing there'));

    fs.writeFileSync(path.join(__dirname, '..', 'data', `share-${label.replace(/\W+/g, '-')}.png`),
      require('electron').nativeImage.createFromBitmap(
        Buffer.from(buf.map((v, i) => (i % 4 === 3 ? 255 : v))), { width: w, height: h }).toPNG());
  }

  console.log('');
  await grab('entire screen', (s) => s.find((x) => x.id.startsWith('screen:')));
  await grab('a window', (s) => s.find((x) => x.name.includes('Local Disk'))
    || s.find((x) => x.id.startsWith('window:') && x.name && !x.name.includes('probe')));

  console.log('');
  console.log('  A "tab" share cannot be tested here -- Chrome captures a tab inside the');
  console.log('  renderer, so nothing on the desktop can ever appear in it. It is the');
  console.log('  safest option by construction.');
  console.log('');

  overlay.destroy();
  app.exit(0);
});
