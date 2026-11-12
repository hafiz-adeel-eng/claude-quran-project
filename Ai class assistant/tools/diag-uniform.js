'use strict';
/* Is the overlay's rectangle a featureless mask, or is real content showing
   through? Compares pixel variance inside the overlay against a control strip
   of the same size elsewhere on screen. */
const { app, desktopCapturer, screen } = require('electron');
const fs = require('fs'), path = require('path');
const store = require('../src/main/store');

function stats(buf, W, x0, y0, x1, y1) {
  let n = 0, sum = 0, sumSq = 0;
  const uniq = new Set();
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4;
      if (i + 2 >= buf.length) continue;
      const lum = (buf[i + 2] * 0.299 + buf[i + 1] * 0.587 + buf[i] * 0.114);
      sum += lum; sumSq += lum * lum; n++;
      if (uniq.size < 5000) uniq.add((buf[i + 2] >> 3) << 10 | (buf[i + 1] >> 3) << 5 | (buf[i] >> 3));
    }
  }
  if (!n) return null;
  const mean = sum / n;
  return { n, mean, std: Math.sqrt(Math.max(0, sumSq / n - mean * mean)), colours: uniq.size };
}

app.whenReady().then(async () => {
  const s = store.getSettings().overlay;
  const d = screen.getPrimaryDisplay().size;
  const [srcs] = [await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: d })];
  const img = srcs[0].thumbnail, size = img.getSize(), buf = img.toBitmap();
  const sx = size.width / d.width, sy = size.height / d.height;

  const ox0 = Math.round(s.x * sx), oy0 = Math.round(s.y * sy);
  const ox1 = Math.min(size.width, Math.round((s.x + s.width) * sx));
  const oy1 = Math.min(size.height, Math.round((s.y + s.height) * sy));

  const inside = stats(buf, size.width, ox0, oy0, ox1, oy1);
  // Control: same-sized block on the opposite side of the screen.
  const cw = ox1 - ox0, ch = oy1 - oy0;
  const cx0 = Math.max(0, ox0 - cw - 20);
  const control = stats(buf, size.width, cx0, oy0, cx0 + cw, oy1);

  console.log('  inside overlay : mean', inside.mean.toFixed(1), '| std', inside.std.toFixed(2), '| distinct colours', inside.colours);
  console.log('  control strip  : mean', control.mean.toFixed(1), '| std', control.std.toFixed(2), '| distinct colours', control.colours);
  console.log('');
  const masked = inside.std < 4 || inside.colours <= 3;
  console.log('  VERDICT:', masked
    ? 'overlay region is FEATURELESS -> it is being masked, viewers see a box'
    : 'overlay region has real detail -> content behind is showing through (invisible)');

  fs.writeFileSync(path.join(__dirname, '..', 'data', 'diag-uniform.png'), img.toPNG());
  console.log('  saved data/diag-uniform.png');
  app.exit(0);
});
