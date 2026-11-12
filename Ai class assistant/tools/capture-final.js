'use strict';
/* Compares Electron's setContentProtection against a real
   WDA_EXCLUDEFROMCAPTURE, on the capture path Meet and Zoom actually use. */
const { app, BrowserWindow, desktopCapturer, screen } = require('electron');
const fs = require('fs'); const path = require('path');
const cap = require('../src/main/win-capture');

// Modern Chrome captures the screen with Windows Graphics Capture, which is the
// API that honours WDA_EXCLUDEFROMCAPTURE. Older capture paths (GDI/DXGI) black
// the window out instead. Force WGC so this test sees what Meet sees.
app.commandLine.appendSwitch('enable-features',
  'AllowWgcDesktopCapturer,AllowWgcScreenCapturer,AllowWgcWindowCapturer,WebRtcAllowWgcDesktopCapturer');

const MARK = { r: 255, g: 0, b: 200 };
const html = (c) => 'data:text/html,' + encodeURIComponent(
  `<body style="margin:0;height:100vh;background:rgb(${c.r},${c.g},${c.b})"></body>`);
const near = (p,c,t=30)=>Math.abs(p.r-c.r)<=t&&Math.abs(p.g-c.g)<=t&&Math.abs(p.b-c.b)<=t;
const isBlack = (p)=>p.r<14&&p.g<14&&p.b<14;

app.whenReady().then(async () => {
  const area = screen.getPrimaryDisplay().workArea;
  const W=260,H=200,Y=area.y+300;
  const mk = async (i, label, apply) => {
    const X = area.x + 40 + i*(W+20);
    const w = new BrowserWindow({ x:X,y:Y,width:W,height:H,frame:false,transparent:false,
      alwaysOnTop:true,skipTaskbar:true,hasShadow:false,backgroundColor:'#000000' });
    w.setAlwaysOnTop(true,'screen-saver');
    await w.loadURL(html(MARK));
    const info = apply(w);
    return { label, w, X, Y, info };
  };

  const wins = [];
  wins.push(await mk(0,'setContentProtection', (w)=>{ w.setContentProtection(true); return {mode:'electron', aff:cap.affinityOf(w)}; }));
  wins.push(await mk(1,'WDA_EXCLUDEFROMCAPTURE', (w)=>{ const r=cap.hideFromCapture(w); return {...r, aff:cap.affinityOf(w)}; }));
  wins.push(await mk(2,'no protection (control)', ()=>({mode:'none'})));

  console.log('\n  supportsExcludeFromCapture:', cap.supportsExcludeFromCapture());
  for (const x of wins) console.log('  ' + x.label.padEnd(24), JSON.stringify(x.info));

  await new Promise(r=>setTimeout(r,3000));
  const {width,height}=screen.getPrimaryDisplay().size;
  const [src]=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width,height}});
  const img=src.thumbnail,size=img.getSize(),buf=img.toBitmap();
  const sx=size.width/width, sy=size.height/height;

  console.log('\n  variant                   mark px   black px   verdict');
  console.log('  ' + '-'.repeat(64));
  for (const r of wins) {
    let mark=0,black=0,total=0;
    for (let y=Math.round(r.Y*sy); y<Math.round((r.Y+H)*sy); y++)
      for (let x=Math.round(r.X*sx); x<Math.round((r.X+W)*sx); x++) {
        const i=(y*size.width+x)*4; if (i+2>=buf.length) continue;
        const p={b:buf[i],g:buf[i+1],r:buf[i+2]}; total++;
        if (near(p,MARK)) mark++; else if (isBlack(p)) black++;
      }
    const mp=mark/total*100, bp=black/total*100;
    const verdict = mp>10 ? 'VISIBLE - leaks' : bp>60 ? 'BLACK BOX - obvious' : 'INVISIBLE - correct';
    console.log('  '+r.label.padEnd(26)+(mp.toFixed(1)+'%').padEnd(10)+(bp.toFixed(1)+'%').padEnd(11)+verdict);
  }
  fs.writeFileSync(path.join(__dirname,'..','data','capture-final.png'), img.toPNG());
  console.log('\n  saved data/capture-final.png\n');
  wins.forEach(r=>r.w.destroy());
  app.exit(0);
});
