'use strict';
/**
 * Verifies the headline claim: the overlay is invisible to screen sharing.
 *
 * Google Meet and Zoom capture the screen through getDisplayMedia, which on
 * Windows goes to the same place Electron's desktopCapturer does. So we make
 * two windows -- one protected, one not, each filled with a unique flat colour
 * -- capture the screen the way a meeting would, and count the pixels.
 *
 * PASS = the control colour is present and the protected colour is absent.
 *
 * Run:  node_modules/electron/dist/electron.exe tools/capture-test.js
 */

const { app, BrowserWindow, desktopCapturer, screen } = require('electron');
const fs = require('fs');
const path = require('path');

const PROTECTED = { r: 255, g: 0, b: 200 };   // magenta - must NOT be captured
const CONTROL = { r: 0, g: 255, b: 100 };     // green   - must be captured

function page(c) {
  const css = `background:rgb(${c.r},${c.g},${c.b});margin:0;height:100vh`;
  return 'data:text/html,' + encodeURIComponent(`<body style="${css}"></body>`);
}

function near(px, c, tol = 26) {
  return Math.abs(px.r - c.r) <= tol && Math.abs(px.g - c.g) <= tol && Math.abs(px.b - c.b) <= tol;
}

app.disableHardwareAcceleration();   // keep the capture path deterministic

app.whenReady().then(async () => {
  const area = screen.getPrimaryDisplay().workArea;

  const mk = (x, protect) => {
    const w = new BrowserWindow({
      x, y: area.y + 120, width: 300, height: 240,
      frame: false, transparent: false, alwaysOnTop: true, skipTaskbar: true,
      backgroundColor: '#000000',
      webPreferences: { offscreen: false },
    });
    w.setAlwaysOnTop(true, 'screen-saver');
    if (protect) w.setContentProtection(true);
    w.loadURL(page(protect ? PROTECTED : CONTROL));
    return w;
  };

  const wProt = mk(area.x + 60, true);
  const wCtl = mk(area.x + 400, false);

  await new Promise((r) => setTimeout(r, 2500));   // let the compositor settle

  const display = screen.getPrimaryDisplay();
  const { width, height } = display.size;
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width, height },
  });

  const src = sources[0];
  const img = src.thumbnail;
  const size = img.getSize();
  const buf = img.toBitmap();               // BGRA

  let protCount = 0, ctlCount = 0;
  for (let i = 0; i < buf.length; i += 4) {
    const px = { b: buf[i], g: buf[i + 1], r: buf[i + 2] };
    if (near(px, PROTECTED)) protCount++;
    if (near(px, CONTROL)) ctlCount++;
  }

  const outDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'capture-test.png');
  fs.writeFileSync(outFile, img.toPNG());

  const total = size.width * size.height;
  const pass = ctlCount > 1000 && protCount === 0;

  console.log('');
  console.log('  capture source   :', src.name);
  console.log('  captured size    :', size.width + 'x' + size.height, `(${total} px)`);
  console.log('  CONTROL   pixels :', ctlCount, ctlCount > 1000 ? '(visible - as expected)' : '(NOT VISIBLE - test is invalid)');
  console.log('  PROTECTED pixels :', protCount, protCount === 0 ? '(invisible - content protection works)' : '(LEAKED - overlay would be seen)');
  console.log('  saved capture    :', outFile);
  console.log('');
  console.log(pass ? '  RESULT: PASS - the overlay is not visible to screen sharing.'
                   : '  RESULT: FAIL');
  console.log('');

  wProt.destroy();
  wCtl.destroy();
  app.exit(pass ? 0 : 1);
});
