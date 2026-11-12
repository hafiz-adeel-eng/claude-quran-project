'use strict';
/* If sharing the ENTIRE SCREEN blacks the overlay out, does sharing a single
   WINDOW avoid the problem entirely? Window capture should only ever contain
   that window's own pixels, regardless of what floats above it. */
const { app, BrowserWindow, desktopCapturer, screen } = require('electron');
const fs=require('fs'), path=require('path');
const cap = require('../src/main/win-capture');
const MARK={r:255,g:0,b:200};
const page=(c,t)=>'data:text/html,'+encodeURIComponent(
  `<body style="margin:0;height:100vh;background:${c};color:#fff;font:28px sans-serif">${t}</body>`);

app.whenReady().then(async () => {
  const area=screen.getPrimaryDisplay().workArea;
  // The "shared" window - what he would pick in Meet.
  const shared=new BrowserWindow({x:area.x+80,y:area.y+120,width:700,height:460,
    title:'SHARED-TARGET-WINDOW',frame:true,backgroundColor:'#1e6fd9'});
  await shared.loadURL(page('#1e6fd9','This is the window being shared'));
  shared.setTitle('SHARED-TARGET-WINDOW');
  await new Promise(r=>setTimeout(r,600));

  // The overlay, sitting ON TOP of it, protected.
  const ov=new BrowserWindow({x:area.x+300,y:area.y+240,width:320,height:220,frame:false,
    transparent:false,alwaysOnTop:true,skipTaskbar:true,hasShadow:false,backgroundColor:'#000'});
  ov.setAlwaysOnTop(true,'screen-saver');
  await ov.loadURL(page(`rgb(${MARK.r},${MARK.g},${MARK.b})`,'OVERLAY'));
  const info=cap.hideFromCapture(ov);
  console.log('\n  overlay affinity:', cap.affinityOf(ov), '| mode:', info.mode);

  await new Promise(r=>setTimeout(r,2500));

  const sources=await desktopCapturer.getSources({types:['window'],thumbnailSize:{width:1400,height:900}});
  const src=sources.find(s=>s.name.includes('SHARED-TARGET-WINDOW'))||sources.find(s=>s.name.includes('This is the window'));
  if(!src){ console.log('  could not find the shared window among', sources.length, 'windows'); 
            sources.slice(0,10).forEach(s=>console.log('   -',s.name)); return app.exit(1); }

  const img=src.thumbnail, size=img.getSize(), buf=img.toBitmap();
  let mark=0,black=0,blue=0,total=size.width*size.height;
  for(let i=0;i<buf.length;i+=4){
    const b=buf[i],g=buf[i+1],r=buf[i+2];
    if(Math.abs(r-MARK.r)<=30&&Math.abs(g-MARK.g)<=30&&Math.abs(b-MARK.b)<=30) mark++;
    else if(r<14&&g<14&&b<14) black++;
    else if(Math.abs(r-0x1e)<=26&&Math.abs(g-0x6f)<=26&&Math.abs(b-0xd9)<=26) blue++;
  }
  fs.writeFileSync(path.join(__dirname,'..','data','capture-window.png'), img.toPNG());
  console.log('  captured window :', src.name, size.width+'x'+size.height);
  console.log('  overlay pixels  :', mark, '('+(mark/total*100).toFixed(1)+'%)');
  console.log('  black pixels    :', black, '('+(black/total*100).toFixed(1)+'%)');
  console.log('  window content  :', blue, '('+(blue/total*100).toFixed(1)+'%)');
  console.log('\n  ' + (mark===0&&black/total<0.2 ? 'PASS - sharing a single window does NOT show the overlay at all.'
                                                  : 'FAIL - the overlay affects window capture too.'));
  console.log('  saved data/capture-window.png\n');
  app.exit(0);
});
