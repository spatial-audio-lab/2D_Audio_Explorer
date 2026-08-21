import { S, app, mainCanvas, ctx, minimapCanvas, minimapCtx, targetIndicator } from './dom-state.js';
import { updateReverbSend, updateAirAbsorption, updateListener, updPanners } from './audio-engine.js';
import { showToast } from './ui.js';
import { nakladkaOtwarta } from './modal.js';
import { playSource, stopSource, selectSource, renderSources } from './sources.js';
import { updateMotion } from './motion.js';

// CANVAS
function resizeCanvases(){
  const r=mainCanvas.parentElement.getBoundingClientRect(), dpr=devicePixelRatio||1;
  mainCanvas.width=r.width*dpr; mainCanvas.height=r.height*dpr;
  mainCanvas.style.width=r.width+'px'; mainCanvas.style.height=r.height+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
  minimapCanvas.width=120*dpr; minimapCanvas.height=120*dpr;
  minimapCtx.setTransform(dpr,0,0,dpr,0,0);
}


// MODE SWITCH


function pisze(t){
  if(!t) return false;
  const tag=t.tagName;
  return tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||t.isContentEditable;
}
// Nakladka na wierzchu przejmuje klawiature: bez tego Spacja czytana w tle uruchamiala
// dzwiek pod otwarta pomoca, a WASD chodzilo po niewidocznej scenie.
// nakladkaOtwarta() jest zadeklarowana raz, przy obsludze paska — druga deklaracja tej
// samej nazwy wygralaby po cichu przez hoisting.


// MOUSE / TOUCH
function gcp(e){ const r=mainCanvas.getBoundingClientRect(); return {x:e.clientX-r.left, y:e.clientY-r.top, rect:r}; }
function s2w(sx,sy,r){ const sz=Math.min(r.width,r.height), sc=sz/(S.worldSize*2), cx=r.width/2, cy=r.height/2; if(S.mode==='explore'){ const rad=S.listener.angle*Math.PI/180, dx=(sx-cx)/sc, dy=(sy-cy)/sc; return {x:S.listener.x+dx*Math.cos(rad)-dy*Math.sin(rad), y:S.listener.y+dx*Math.sin(rad)+dy*Math.cos(rad)}; } return {x:(sx-cx)/sc, y:(sy-cy)/sc}; }
function w2s(wx,wy){ const r=mainCanvas.getBoundingClientRect(), sz=Math.min(r.width,r.height), sc=sz/(S.worldSize*2), cx=r.width/2, cy=r.height/2; if(S.mode==='explore'){ const rad=S.listener.angle*Math.PI/180, dx=wx-S.listener.x, dy=wy-S.listener.y; return {x:cx+(dx*Math.cos(rad)+dy*Math.sin(rad))*sc, y:cy+(-dx*Math.sin(rad)+dy*Math.cos(rad))*sc}; } return {x:cx+wx*sc, y:cy+wy*sc}; }
function findAt(wx,wy,th=1.5){ for(const s of S.sources) if(Math.hypot(s.x-wx,s.y-wy)<th) return s; return null; }

let dragSrc=null, pDown=false, pMoved=false, pStart={x:0,y:0};


function ptrDown(cx,cy,shiftKey){
  const{x,y,rect}=gcp({clientX:cx,clientY:cy}); const w=s2w(x,y,rect);
  if(shiftKey && S.mode==='edit' && S.selectedSource && S.selectedSource.motion.mode==='path'){ S.selectedSource.motion.waypoints.push({x:w.x,y:w.y}); showToast('Punkt #'+S.selectedSource.motion.waypoints.length); return; }
  pDown=true; pMoved=false; pStart={x:cx,y:cy};
  if(S.mode==='edit'){ const s=findAt(w.x,w.y); if(s){dragSrc=s; selectSource(s);} }
  else S.dragStartAngle=S.listener.angle;
}
function ptrMove(cx,cy){
  if(!pDown) return; const dx=cx-pStart.x, dy=cy-pStart.y; if(Math.abs(dx)>5||Math.abs(dy)>5) pMoved=true;
  if(S.mode==='edit'&&dragSrc){ const{x,y,rect}=gcp({clientX:cx,clientY:cy}); const w=s2w(x,y,rect); const m=S.worldSize-1; const nx=Math.max(-m,Math.min(m,w.x)), ny=Math.max(-m,Math.min(m,w.y));
    if(dragSrc.motion.mode==='orbit'||dragSrc.motion.mode==='random'){ const ddx=nx-dragSrc.x, ddy=ny-dragSrc.y; dragSrc.motion.originX+=ddx; dragSrc.motion.originY+=ddy; }
    dragSrc.x=nx; dragSrc.y=ny; updPanners(dragSrc); renderSources();
  } else if(S.mode==='explore'&&pMoved){ S.listener.angle=S.dragStartAngle+dx*0.5; S.listener.angle=((S.listener.angle%360)+360)%360; updateListener(); }
}
function ptrUp(cx,cy){ if(S.mode==='explore'&&!pMoved&&pDown){ const{x,y,rect}=gcp({clientX:cx,clientY:cy}); S.target=s2w(x,y,rect); } pDown=false; dragSrc=null; }

// MOTION AUTOMATION
// -----------------------------------------------------------------------------------------
// JEDEN krok ruchu JEDNEGO zrodla. Wyciagniete z updateMotion() do osobnej funkcji, bo ten
// sam kod obsluguje teraz dwa zegary: klatke ekranu (requestAnimationFrame) i symulacje
// trajektorii na potrzeby eksportu. Gdyby to byly dwie kopie, plik zaczalby sie rozjezdzac
// ze scena — dokladnie tak, jak tor FOA rozjechal sie z binauralnym przed sierpniem 2026.
// `pos` (obiekt z .x/.y) i `mo` sa mutowane w miejscu — orbitAngle, pathIndex i randomTimer
// to stan ruchu, nie parametry. `rnd` to zrodlo losowosci: na ekranie Math.random,
// w eksporcie generator z ziarnem, zeby ten sam eksport dwa razy dal ten sam plik.

// GAME LOOP
let lastT=performance.now();
function loop(ts){
  const dt=Math.min((ts-lastT)/1000,0.1); lastT=ts;
  if(S.mode==='explore'){
    let rot=0;
    if(S.keys.KeyQ||S.keys.ArrowLeft) rot-=S.rotSpeed*dt;
    if(S.keys.KeyE||S.keys.ArrowRight) rot+=S.rotSpeed*dt;
    S.listener.angle+=rot;
    const rad=S.listener.angle*Math.PI/180; let mx=0,my=0;
    if(S.keys.KeyW||S.keys.ArrowUp){mx+=Math.sin(rad);my-=Math.cos(rad);}
    if(S.keys.KeyS||S.keys.ArrowDown){mx-=Math.sin(rad);my+=Math.cos(rad);}
    if(S.keys.KeyA){mx-=Math.cos(rad);my-=Math.sin(rad);}
    if(S.keys.KeyD){mx+=Math.cos(rad);my+=Math.sin(rad);}
    if(mx||my){S.target=null;const l=Math.hypot(mx,my);S.listener.x+=(mx/l)*S.moveSpeed*dt;S.listener.y+=(my/l)*S.moveSpeed*dt;}
    if(S.target){const dx=S.target.x-S.listener.x,dy=S.target.y-S.listener.y,d=Math.hypot(dx,dy);if(d<0.3)S.target=null;else{const st=Math.min(S.moveSpeed*dt,d);S.listener.x+=(dx/d)*st;S.listener.y+=(dy/d)*st;}}
    const m=S.worldSize-1; S.listener.x=Math.max(-m,Math.min(m,S.listener.x)); S.listener.y=Math.max(-m,Math.min(m,S.listener.y)); S.listener.angle=((S.listener.angle%360)+360)%360;
    updateListener();
    for(const src of S.sources){ if(src.routing==='spatial') updateReverbSend(src); }
  }
  if(S.target&&S.mode==='explore'){const p=w2s(S.target.x,S.target.y);targetIndicator.style.left=(p.x-10)+'px';targetIndicator.style.top=(p.y-10)+'px';targetIndicator.classList.add('visible');}
  else targetIndicator.classList.remove('visible');
  updateMotion(dt); updateAirAbsorption();
  draw(); drawMinimap(); requestAnimationFrame(loop);
}

// DRAW — Main canvas
function draw(){
  const w=mainCanvas.width/(devicePixelRatio||1), h=mainCanvas.height/(devicePixelRatio||1);
  ctx.fillStyle='#0A0C08'; ctx.fillRect(0,0,w,h);
  const sz=Math.min(w,h), sc=sz/(S.worldSize*2), cx=w/2, cy=h/2;
  ctx.save(); ctx.translate(cx,cy);
  if(S.mode==='explore'){ const rad=S.listener.angle*Math.PI/180; ctx.rotate(-rad); ctx.translate(-S.listener.x*sc,-S.listener.y*sc); }
  ctx.strokeStyle='rgba(0,229,204,0.04)'; ctx.lineWidth=1;
  for(let i=-S.worldSize;i<=S.worldSize;i+=5){ ctx.beginPath();ctx.moveTo(i*sc,-S.worldSize*sc);ctx.lineTo(i*sc,S.worldSize*sc);ctx.stroke(); ctx.beginPath();ctx.moveTo(-S.worldSize*sc,i*sc);ctx.lineTo(S.worldSize*sc,i*sc);ctx.stroke(); }
  ctx.strokeStyle='rgba(0,229,204,0.15)'; ctx.strokeRect(-S.worldSize*sc,-S.worldSize*sc,S.worldSize*2*sc,S.worldSize*2*sc);
  if(S.target&&S.mode==='explore'){ ctx.strokeStyle='rgba(0,229,204,0.2)';ctx.lineWidth=1;ctx.setLineDash([6,6]); ctx.beginPath();ctx.moveTo(S.listener.x*sc,S.listener.y*sc);ctx.lineTo(S.target.x*sc,S.target.y*sc);ctx.stroke(); ctx.setLineDash([]); ctx.strokeStyle='rgba(0,229,204,0.4)';ctx.beginPath();ctx.arc(S.target.x*sc,S.target.y*sc,8,0,Math.PI*2);ctx.stroke(); }

  S.sources.forEach((s,i)=>{
    const sx=s.x*sc, sy=s.y*sc, sel=S.selectedSource===s, isDirect=s.routing==='direct';
    const halfW=s.width/2, srad=(s.spreadAngle||0)*Math.PI/180;
    const dxW=halfW*Math.cos(srad)*sc, dyW=halfW*Math.sin(srad)*sc;
    const hasWidth=s.width>0.05&&!isDirect;
    const cMain=isDirect?'255,171,0':'0,229,204', cHex=isDirect?'#FFAB00':'#00E5CC';
    const mo=s.motion, hOff=Math.abs(s.height||0)>0.2?(s.height*sc*0.3):0;
    const drawY=sy-hOff;

    // Elevation stem
    if(hOff!==0&&!isDirect){ ctx.globalAlpha=0.15;ctx.strokeStyle='#00E5CC';ctx.lineWidth=1;ctx.setLineDash([3,3]); ctx.beginPath();ctx.ellipse(sx,sy,10,5,0,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]); ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(sx,drawY);ctx.stroke();ctx.globalAlpha=1; }

    // Motion viz
    if(mo.mode==='orbit'&&sel){ ctx.strokeStyle=`rgba(${cMain},0.12)`;ctx.lineWidth=1;ctx.setLineDash([4,4]);ctx.beginPath();ctx.arc(mo.originX*sc,mo.originY*sc,mo.orbitRadius*sc,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]); ctx.fillStyle=`rgba(${cMain},0.3)`;ctx.beginPath();ctx.arc(mo.originX*sc,mo.originY*sc,3,0,Math.PI*2);ctx.fill(); }
    if(mo.mode==='random'&&sel){ ctx.strokeStyle=`rgba(${cMain},0.08)`;ctx.lineWidth=1;ctx.setLineDash([3,6]);ctx.beginPath();ctx.arc(mo.originX*sc,mo.originY*sc,mo.randomRange*sc,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]); const tx=mo.randomTX*sc,ty=mo.randomTY*sc;ctx.strokeStyle=`rgba(${cMain},0.25)`;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(tx-4,ty);ctx.lineTo(tx+4,ty);ctx.moveTo(tx,ty-4);ctx.lineTo(tx,ty+4);ctx.stroke(); }
    if(mo.mode==='path'&&mo.waypoints.length>0){ const wp=mo.waypoints; ctx.strokeStyle=sel?`rgba(${cMain},0.3)`:`rgba(${cMain},0.1)`;ctx.lineWidth=sel?1.5:1;ctx.setLineDash(sel?[]:[3,3]); ctx.beginPath();ctx.moveTo(wp[0].x*sc,wp[0].y*sc); for(let wi=1;wi<wp.length;wi++) ctx.lineTo(wp[wi].x*sc,wp[wi].y*sc); if(mo.pathLoop&&wp.length>2) ctx.lineTo(wp[0].x*sc,wp[0].y*sc); ctx.stroke();ctx.setLineDash([]);
      if(sel){ wp.forEach((w,wi)=>{ ctx.fillStyle=wi===(mo.pathIndex+1)%wp.length?`rgba(${cMain},0.6)`:`rgba(${cMain},0.2)`;ctx.beginPath();ctx.arc(w.x*sc,w.y*sc,4,0,Math.PI*2);ctx.fill(); ctx.fillStyle=`rgba(${cMain},0.5)`;ctx.font="10px 'Azeret Mono',monospace";ctx.textAlign='center';ctx.textBaseline='bottom';ctx.fillText(String(wi+1),w.x*sc,w.y*sc-6); }); } }

    // Playing glow
    if(s.playing){ const t=performance.now()/1000, r=40+Math.sin(t*2+i)*15;
      if(hasWidth){ ctx.save();ctx.translate(sx,drawY);ctx.rotate(srad);ctx.scale(1+halfW*sc/r,1); const g=ctx.createRadialGradient(0,0,0,0,0,r);g.addColorStop(0,`rgba(${cMain},0.18)`);g.addColorStop(1,`rgba(${cMain},0)`);ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();ctx.restore(); }
      else { const g=ctx.createRadialGradient(sx,drawY,0,sx,drawY,r);g.addColorStop(0,`rgba(${cMain},0.2)`);g.addColorStop(1,`rgba(${cMain},0)`);ctx.fillStyle=g;ctx.beginPath();ctx.arc(sx,drawY,r,0,Math.PI*2);ctx.fill(); } }

    // Stereo width line
    if(hasWidth){ const lx=sx-dxW,ly=drawY-dyW,rx=sx+dxW,ry=drawY+dyW;
      ctx.strokeStyle=sel?`rgba(${cMain},0.4)`:(s.playing?`rgba(${cMain},0.25)`:'rgba(240,235,224,0.08)');ctx.lineWidth=sel?2:1; ctx.beginPath();ctx.moveTo(lx,ly);ctx.lineTo(rx,ry);ctx.stroke();
      [lx,rx].forEach((px,pi)=>{ const py=pi===0?ly:ry; ctx.fillStyle=sel||s.playing?`rgba(${cMain},0.2)`:'rgba(240,235,224,0.10)';ctx.beginPath();ctx.arc(px,py,6,0,Math.PI*2);ctx.fill(); ctx.strokeStyle=sel||s.playing?`rgba(${cMain},0.5)`:'rgba(240,235,224,0.08)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(px,py,6,0,Math.PI*2);ctx.stroke(); ctx.fillStyle='rgba(156,152,144,0.6)';ctx.font="bold 8px 'Azeret Mono',monospace";ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(pi===0?'L':'R',px,py); }); }

    // Main node
    const R=sel?14:12;
    ctx.strokeStyle=s.playing?`rgba(${cMain},0.7)`:'rgba(46,46,56,0.9)'; ctx.lineWidth=sel?2:1;
    if(isDirect){ ctx.beginPath();ctx.moveTo(sx,drawY-R);ctx.lineTo(sx+R,drawY);ctx.lineTo(sx,drawY+R);ctx.lineTo(sx-R,drawY);ctx.closePath();ctx.stroke(); ctx.fillStyle=sel?`rgba(${cMain},0.15)`:(s.playing?`rgba(${cMain},0.08)`:'rgba(240,235,224,0.10)');ctx.fill(); }
    else { ctx.beginPath();ctx.arc(sx,drawY,R,0,Math.PI*2);ctx.stroke(); ctx.fillStyle=sel?'rgba(0,229,204,0.18)':(s.playing?'rgba(0,229,204,0.10)':'rgba(46,46,56,0.4)');ctx.beginPath();ctx.arc(sx,drawY,R,0,Math.PI*2);ctx.fill(); }
    ctx.fillStyle=sel||s.playing?cHex:'#9C9890'; ctx.font="400 14px 'Azeret Mono',monospace"; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(String(i+1).padStart(2,'0'),sx,drawY);

    if(S.mode==='edit'){ ctx.fillStyle='rgba(156,152,144,0.85)';ctx.font="13px 'Azeret Mono',monospace";ctx.textAlign='center'; ctx.fillText(s.name.length>18?s.name.slice(0,15)+'…':s.name,sx,drawY+R+16);
      if(isDirect){ctx.fillStyle='rgba(255,171,0,0.5)';ctx.font="bold 10px 'Azeret Mono',monospace";ctx.fillText('DIRECT',sx,drawY+R+30);}
      if(Math.abs(s.height||0)>0.2){ctx.fillStyle='rgba(255,171,0,0.7)';ctx.font="12px 'Azeret Mono',monospace";ctx.fillText((s.height>0?'↑':'↓')+Math.abs(s.height).toFixed(1)+'m',sx,drawY-R-8);} }
  });

  const lx=S.listener.x*sc, ly=S.listener.y*sc, lr=S.listener.angle*Math.PI/180;
  const lCol=S.mode==='edit'?'255,171,0':'0,229,204', lHex=S.mode==='edit'?'#FFAB00':'#00E5CC';
  ctx.fillStyle=`rgba(${lCol},0.07)`;ctx.beginPath();ctx.moveTo(lx,ly);ctx.arc(lx,ly,80,lr-Math.PI/2-Math.PI/5,lr-Math.PI/2+Math.PI/5);ctx.closePath();ctx.fill();
  ctx.strokeStyle=`rgba(${lCol},0.5)`;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(lx,ly);ctx.lineTo(lx+Math.sin(lr)*30,ly-Math.cos(lr)*30);ctx.stroke();
  ctx.strokeStyle=lHex;ctx.lineWidth=2;ctx.beginPath();ctx.arc(lx,ly,10,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle=`rgba(${lCol},0.22)`;ctx.beginPath();ctx.arc(lx,ly,10,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=lHex;ctx.beginPath();ctx.arc(lx,ly,3,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

function drawMinimap(){
  const s=120, sc=s/(S.worldSize*2);
  minimapCtx.fillStyle='#0A0C08'; minimapCtx.fillRect(0,0,s,s);
  minimapCtx.save(); minimapCtx.translate(s/2,s/2);
  minimapCtx.strokeStyle='rgba(0,229,204,0.07)'; minimapCtx.lineWidth=0.5;
  for(let i=-S.worldSize;i<=S.worldSize;i+=10){ minimapCtx.beginPath();minimapCtx.moveTo(i*sc,-S.worldSize*sc);minimapCtx.lineTo(i*sc,S.worldSize*sc);minimapCtx.stroke(); minimapCtx.beginPath();minimapCtx.moveTo(-S.worldSize*sc,i*sc);minimapCtx.lineTo(S.worldSize*sc,i*sc);minimapCtx.stroke(); }
  minimapCtx.strokeStyle='rgba(0,229,204,0.18)'; minimapCtx.strokeRect(-S.worldSize*sc,-S.worldSize*sc,S.worldSize*2*sc,S.worldSize*2*sc);
  S.sources.forEach(src=>{ const isDirect=src.routing==='direct';
    const mo=src.motion;
    if(mo.mode==='orbit'){minimapCtx.strokeStyle='rgba(0,229,204,0.08)';minimapCtx.lineWidth=0.5;minimapCtx.beginPath();minimapCtx.arc(mo.originX*sc,mo.originY*sc,mo.orbitRadius*sc,0,Math.PI*2);minimapCtx.stroke();}
    if(mo.mode==='path'&&mo.waypoints.length>1){minimapCtx.strokeStyle='rgba(0,229,204,0.1)';minimapCtx.lineWidth=0.5;minimapCtx.beginPath();minimapCtx.moveTo(mo.waypoints[0].x*sc,mo.waypoints[0].y*sc);for(let wi=1;wi<mo.waypoints.length;wi++)minimapCtx.lineTo(mo.waypoints[wi].x*sc,mo.waypoints[wi].y*sc);if(mo.pathLoop&&mo.waypoints.length>2)minimapCtx.lineTo(mo.waypoints[0].x*sc,mo.waypoints[0].y*sc);minimapCtx.stroke();}
    const hasW=src.width>0.05&&!isDirect;
    if(hasW){const hw=src.width/2,sr2=(src.spreadAngle||0)*Math.PI/180,ddx=hw*Math.cos(sr2)*sc,ddy=hw*Math.sin(sr2)*sc;minimapCtx.strokeStyle=src.playing?'rgba(0,229,204,0.4)':'rgba(240,235,224,0.08)';minimapCtx.lineWidth=1;minimapCtx.beginPath();minimapCtx.moveTo(src.x*sc-ddx,src.y*sc-ddy);minimapCtx.lineTo(src.x*sc+ddx,src.y*sc+ddy);minimapCtx.stroke();}
    minimapCtx.fillStyle=isDirect?(src.playing?'#FFAB00':'#5A4410'):(src.playing?'#00E5CC':'#33362F');
    if(isDirect){const mx=src.x*sc,my=src.y*sc;minimapCtx.beginPath();minimapCtx.moveTo(mx,my-3);minimapCtx.lineTo(mx+3,my);minimapCtx.lineTo(mx,my+3);minimapCtx.lineTo(mx-3,my);minimapCtx.closePath();minimapCtx.fill();}
    else{minimapCtx.beginPath();minimapCtx.arc(src.x*sc,src.y*sc,3,0,Math.PI*2);minimapCtx.fill();}
  });
  const lx=S.listener.x*sc,ly=S.listener.y*sc,lr=S.listener.angle*Math.PI/180;
  minimapCtx.fillStyle='rgba(255,171,0,0.15)';minimapCtx.beginPath();minimapCtx.moveTo(lx,ly);minimapCtx.arc(lx,ly,16,lr-Math.PI/2-Math.PI/5,lr-Math.PI/2+Math.PI/5);minimapCtx.closePath();minimapCtx.fill();
  minimapCtx.fillStyle='#FFAB00';minimapCtx.beginPath();minimapCtx.arc(lx,ly,3,0,Math.PI*2);minimapCtx.fill();
  minimapCtx.strokeStyle='#FFAB00';minimapCtx.lineWidth=1;minimapCtx.beginPath();minimapCtx.moveTo(lx,ly);minimapCtx.lineTo(lx+Math.sin(lr)*10,ly-Math.cos(lr)*10);minimapCtx.stroke();
  minimapCtx.restore();
}

export function initScene(){
  addEventListener('resize', resizeCanvases); resizeCanvases();
  document.querySelectorAll('.mode-btn').forEach(b => {
    b.addEventListener('click', () => {
      S.mode=b.dataset.mode;
      document.querySelectorAll('.mode-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      app.classList.remove('edit-mode','explore-mode');
      app.classList.add(S.mode+'-mode');
      S.target=null;
    });
  });
}
export function initSceneInteractions(){
  document.addEventListener('keydown', e=>{ if(nakladkaOtwarta()) return; if(pisze(e.target)) return; S.keys[e.code]=true; if(e.code==='Space'){ e.preventDefault(); if(S.selectedSource){ S.selectedSource.playing?stopSource(S.selectedSource):playSource(S.selectedSource); } } });
  document.addEventListener('keyup', e=>{ S.keys[e.code]=false; });
  mainCanvas.addEventListener('mousedown', e=>ptrDown(e.clientX,e.clientY,e.shiftKey));
  mainCanvas.addEventListener('mousemove', e=>ptrMove(e.clientX,e.clientY));
  mainCanvas.addEventListener('mouseup', e=>ptrUp(e.clientX,e.clientY));
  mainCanvas.addEventListener('mouseleave', ()=>{ pDown=false; dragSrc=null; });
  mainCanvas.addEventListener('touchstart', e=>{ e.preventDefault(); ptrDown(e.touches[0].clientX,e.touches[0].clientY,false); },{passive:false});
  mainCanvas.addEventListener('touchmove', e=>{ e.preventDefault(); ptrMove(e.touches[0].clientX,e.touches[0].clientY); },{passive:false});
  mainCanvas.addEventListener('touchend', e=>{ ptrUp(pStart.x,pStart.y); },{passive:false});
}
export { loop, draw, drawMinimap, resizeCanvases, gcp, s2w, w2s, findAt, ptrDown, ptrMove, ptrUp };
