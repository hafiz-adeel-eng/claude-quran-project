'use strict';
/* Replays exactly what measureCapture() does against the LIVE overlay window,
   printing the numbers instead of a verdict. */
const { app, desktopCapturer, screen } = require('electron');
const store = require('../src/main/store');

app.whenReady().then(async () => {
  const s = store.getSettings().overlay;
  const b = { x: s.x, y: s.y, width: s.width, height: s.height };
  console.log('  overlay bounds from settings:', JSON.stringify(b));
  if (b.x == null) { console.log('  no saved bounds - cannot locate it'); return app.exit(1); }

  const display = screen.getPrimaryDisplay();
  const { width, height } = display.size;
  console.log('  screen:', width + 'x' + height);

  let sources;
  try {
    sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width, height } });
  } catch (e) {
    console.log('  getSources THREW:', e.message);
    return app.exit(1);
  }
  if (!sources.length) { console.log('  no screen sources'); return app.exit(1); }

  const img = sources[0].thumbnail;
  const size = img.getSize();
  const buf = img.toBitmap();
  console.log('  captured:', size.width + 'x' + size.height, '| bitmap', buf.length, 'bytes');

  const sx = size.width / width, sy = size.height / height;
  let black = 0, total = 0, sumR = 0, sumG = 0, sumB = 0;
  for (let y = Math.max(0, Math.round(b.y * sy)); y < Math.min(size.height, Math.round((b.y + b.height) * sy)); y++) {
    for (let x = Math.max(0, Math.round(b.x * sx)); x < Math.min(size.width, Math.round((b.x + b.width) * sx)); x++) {
      const i = (y * size.width + x) * 4;
      if (i + 2 >= buf.length) continue;
      total++;
      sumB += buf[i]; sumG += buf[i + 1]; sumR += buf[i + 2];
      if (buf[i] < 14 && buf[i + 1] < 14 && buf[i + 2] < 14) black++;
    }
  }
  if (!total) { console.log('  overlay rect is off-screen -> inconclusive'); return app.exit(1); }
  const pct = black / total;
  console.log('  pixels in overlay rect :', total);
  console.log('  average colour         : rgb(' + Math.round(sumR/total) + ',' + Math.round(sumG/total) + ',' + Math.round(sumB/total) + ')');
  console.log('  "black" (<14 each)     :', (pct * 100).toFixed(1) + '%');
  console.log('');
  console.log('  measureCapture verdict :', pct > 0.6 ? 'blackBox=true -> UNSAFE' : 'ok=true -> SAFE (no hide)');
  app.exit(0);
});
