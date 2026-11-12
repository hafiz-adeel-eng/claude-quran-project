'use strict';
/* Captures the screen the way Meet does, while the real app is running, and
   reports whether the live overlay window leaks into the capture. */
const { app, desktopCapturer, screen } = require('electron');
const fs = require('fs'); const path = require('path');
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const { width, height } = screen.getPrimaryDisplay().size;
  const [src] = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width, height } });
  const img = src.thumbnail, size = img.getSize(), buf = img.toBitmap();
  let black = 0;
  for (let i = 0; i < buf.length; i += 4) {
    if (buf[i] < 14 && buf[i+1] < 14 && buf[i+2] < 14) black++;
  }
  const total = size.width * size.height;
  fs.writeFileSync(path.join(__dirname,'..','data','verify-overlay.png'), img.toPNG());
  console.log('\n  captured   :', size.width + 'x' + size.height);
  console.log('  black px   :', black, '(' + (black/total*100).toFixed(2) + '% of screen)');
  console.log('  saved      : data/verify-overlay.png\n');
  app.exit(0);
});
