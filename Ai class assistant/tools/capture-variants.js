'use strict';
/**
 * Which window style stays invisible to screen capture?
 *
 * Content protection is only half the story: a TRANSPARENT protected window can
 * still punch a black rectangle into the capture, which on a shared screen is
 * even more obvious than showing the overlay. This finds the style that
 * genuinely disappears.
 */
const { app, BrowserWindow, desktopCapturer, screen } = require('electron');
const fs = require('fs'); const path = require('path');

const MARK = { r: 255, g: 0, b: 200 };
const variants = [
  { key: 'opaque+protected',            transparent: false, protect: true,  opacity: 1 },
  { key: 'transparent+protected',       transparent: true,  protect: true,  opacity: 1 },
  { key: 'opaque+opacity.85+protected', transparent: false, protect: true,  opacity: 0.85 },
  { key: 'transparent+NOprotect',       transparent: true,  protect: false, opacity: 1 },
];

const html = (c) => 'data:text/html,' + encodeURIComponent(
  `<body style="margin:0;height:100vh;background:rgb(${c.r},${c.g},${c.b})"></body>`);
const near = (p, c, t = 30) => Math.abs(p.r-c.r)<=t && Math.abs(p.g-c.g)<=t && Math.abs(p.b-c.b)<=t;
const isBlack = (p) => p.r < 14 && p.g < 14 && p.b < 14;

// HW acceleration left ON: Meet and Zoom capture through the GPU path, and
// disabling it forces a legacy GDI path where exclusion degrades to a blackout.

app.whenReady().then(async () => {
  const area = screen.getPrimaryDisplay().workArea;
  const W = 260, H = 200, Y = area.y + 300;
  const results = [];

  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    const X = area.x + 40 + i * (W + 20);
    const win = new BrowserWindow({
      x: X, y: Y, width: W, height: H,
      frame: false, transparent: v.transparent, alwaysOnTop: true, skipTaskbar: true,
      hasShadow: false,
      backgroundColor: v.transparent ? '#00000000' : '#000000',
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    if (v.protect) win.setContentProtection(true);
    if (v.opacity !== 1) win.setOpacity(v.opacity);
    await win.loadURL(html(MARK));
    results.push({ v, win, X, Y, W, H });
  }

  await new Promise(r => setTimeout(r, 3000));

  const { width, height } = screen.getPrimaryDisplay().size;
  const [src] = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width, height } });
  const img = src.thumbnail, size = img.getSize(), buf = img.toBitmap();
  const sx = size.width / width, sy = size.height / height;

  console.log('\n  capture ' + size.width + 'x' + size.height + '\n');
  console.log('  variant                        mark px   black px   verdict');
  console.log('  ' + '-'.repeat(68));

  for (const r of results) {
    let mark = 0, black = 0, total = 0;
    const x0 = Math.round(r.X * sx), x1 = Math.round((r.X + r.W) * sx);
    const y0 = Math.round(r.Y * sy), y1 = Math.round((r.Y + r.H) * sy);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * size.width + x) * 4;
        if (i + 2 >= buf.length) continue;
        const p = { b: buf[i], g: buf[i+1], r: buf[i+2] };
        total++;
        if (near(p, MARK)) mark++;
        else if (isBlack(p)) black++;
      }
    }
    const mp = (mark / total * 100), bp = (black / total * 100);
    const verdict = mark > total * 0.1 ? 'VISIBLE - leaks'
                  : bp > 60 ? 'BLACK BOX - obvious'
                  : 'INVISIBLE - good';
    console.log('  ' + r.v.key.padEnd(30) + String(mp.toFixed(1) + '%').padEnd(10) + String(bp.toFixed(1) + '%').padEnd(11) + verdict);
  }

  fs.writeFileSync(path.join(__dirname, '..', 'data', 'capture-variants.png'), img.toPNG());
  console.log('\n  saved data/capture-variants.png\n');
  results.forEach(r => r.win.destroy());
  app.exit(0);
});
