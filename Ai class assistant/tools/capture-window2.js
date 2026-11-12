'use strict';
/* Does sharing a single WINDOW (rather than the entire screen) keep the
   overlay out of the capture? Tests against a real external window with the
   protected overlay floating on top of it. */
const { app, BrowserWindow, desktopCapturer, screen } = require('electron');
const fs=require('fs'), path=require('path');
const cap=require('../src/main/win-capture');
const MARK={r:255,g:0,b:200};

app.whenReady().then(async () => {
  const area=screen.getPrimaryDisplay().workArea;
  const ov=new BrowserWindow({x:area.x+380,y:area.y+220,width:360,height:260,frame:false,
    transparent:false,alwaysOnTop:true,skipTaskbar:true,hasShadow:false,backgroundColor:'#000'});
  ov.setAlwaysOnTop(true,'screen-saver');
  await ov.loadURL('data:text/html,'+encodeURIComponent(
    `<body style="margin:0;height:100vh;background:rgb(${MARK.r},${MARK.g},${MARK.b})"></body>`));
  const info=cap.hideFromCapture(ov);
  console.log('\n  overlay affinity:', cap.affinityOf(ov), '| mode:', info.mode);
  await new Promise(r=>setTimeout(r,2500));

  const count=(buf,total,label)=>{
    let mark=0,black=0;
    for(let i=0;i<buf.length;i+=4){
      const b=buf[i],g=buf[i+1],r=buf[i+2];
      if(Math.abs(r-MARK.r)<=30&&Math.abs(g-MARK.g)<=30&&Math.abs(b-MARK.b)<=30) mark++;
      else if(r<14&&g<14&&b<14) black++;
    }
    console.log(`  ${label.padEnd(22)} overlay ${(mark/total*100).toFixed(1)}%   black ${(black/total*100).toFixed(1)}%`);
    return {mark,black};
  };

  // 1) share a single WINDOW
  const wins=await desktopCapturer.getSources({types:['window'],thumbnailSize:{width:1382,height:744}});
  const w=wins.find(s=>s.name.includes('Local Disk'));
  let winRes=null;
  if(w){
    const img=w.thumbnail,sz=img.getSize();
    winRes=count(img.toBitmap(), sz.width*sz.height, 'SHARE A WINDOW');
    fs.writeFileSync(path.join(__dirname,'..','data','share-window.png'), img.toPNG());
  } else console.log('  (target window not listed)');

  // 2) share the ENTIRE SCREEN, for comparison
  const {width,height}=screen.getPrimaryDisplay().size;
  const [scr]=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width,height}});
  const simg=scr.thumbnail,ssz=simg.getSize();
  const scrRes=count(simg.toBitmap(), ssz.width*ssz.height, 'SHARE ENTIRE SCREEN');

  console.log('');
  if(winRes) console.log('  window share :', winRes.mark===0&&winRes.black/(1382*744)<0.05
      ? 'CLEAN - overlay absent, no black box' : 'affected');
  console.log('  screen share :', scrRes.mark===0 ? 'content protected (no leak), but black box present' : 'LEAKS');
  console.log('');
  app.exit(0);
});
