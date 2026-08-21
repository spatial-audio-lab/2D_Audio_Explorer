import { $, S } from './dom-state.js';
import { updPanners, updateReverbSend } from './audio-engine.js';

function stepMotion(mo,pos,dt,m,rnd){
  if(mo.mode==='orbit'){ const angSpeed=mo.speed/Math.max(mo.orbitRadius,0.5); mo.orbitAngle+=angSpeed*dt; pos.x=mo.originX+Math.cos(mo.orbitAngle)*mo.orbitRadius; pos.y=mo.originY+Math.sin(mo.orbitAngle)*mo.orbitRadius; }
  else if(mo.mode==='random'){ mo.randomTimer-=dt; if(mo.randomTimer<=0){ const a=rnd()*Math.PI*2, r=rnd()*mo.randomRange; mo.randomTX=mo.originX+Math.cos(a)*r; mo.randomTY=mo.originY+Math.sin(a)*r; mo.randomTimer=1.5+rnd()*4; }
    const dx=mo.randomTX-pos.x, dy=mo.randomTY-pos.y, dist=Math.hypot(dx,dy); if(dist>0.1){ const step=Math.min(mo.speed*dt,dist); pos.x+=(dx/dist)*step; pos.y+=(dy/dist)*step; } }
  else if(mo.mode==='path'&&mo.waypoints.length>=2){ const wp=mo.waypoints; let ni=mo.pathIndex+mo.pathDir;
    if(ni>=wp.length){ if(mo.pathLoop){ni=0;mo.pathIndex=-1;} else{mo.pathDir=-1;ni=mo.pathIndex+mo.pathDir;} }
    else if(ni<0){ if(mo.pathLoop){ni=wp.length-1;mo.pathIndex=wp.length;} else{mo.pathDir=1;ni=mo.pathIndex+mo.pathDir;} }
    if(ni>=0&&ni<wp.length){ const target=wp[ni]; const dx=target.x-pos.x, dy=target.y-pos.y, dist=Math.hypot(dx,dy); if(dist<0.2){pos.x=target.x;pos.y=target.y;mo.pathIndex=ni;} else{const step=Math.min(mo.speed*dt,dist);pos.x+=(dx/dist)*step;pos.y+=(dy/dist)*step;} } }
  pos.x=Math.max(-m,Math.min(m,pos.x)); pos.y=Math.max(-m,Math.min(m,pos.y));
}
function updateMotion(dt){
  const m=S.worldSize-1;
  for(const s of S.sources){
    const mo=s.motion; if(mo.mode==='static') continue;
    stepMotion(mo,s,dt,m,Math.random);
    if(s.routing==='spatial'){ updPanners(s); updateReverbSend(s); }
  }
}

// SYMULACJA TRAJEKTORII NA POTRZEBY EKSPORTU
// -----------------------------------------------------------------------------------------
// updateMotion() zyje wylacznie w petli requestAnimationFrame, czyli TYLKO na ekranie.
// Do sierpnia 2026 eksport tego nie widzial: pozycje szly do obu plikow jako jedna wartosc
// z chwili klikniecia "Eksportuj" (setValueAtTime na czasie 0), wiec orbita, sciezka i ruch
// losowy nie zostawialy w nagraniu zadnego sladu. Zeby ruch trafil do plikow, trzeba go
// przeliczyc Z GORY i BEZ dotykania zywej sceny — eksport nie moze przesunac zrodel,
// ktorych uzytkownik wlasnie slucha.

// Xorshift32 zamiast Math.random(): ten sam eksport dwa razy ma dac ten sam plik, inaczej
// trybu Random nie da sie ani porownac "przed/po", ani sprawdzic testem.
function makeRng(seed){
  let s=(seed>>>0)||0x9E3779B9;
  return function(){ s^=s<<13; s>>>=0; s^=s>>>17; s^=s<<5; s>>>=0; return s/4294967296; };
}

// Czy zrodlo w ogole sie rusza. Sciezka z mniej niz dwoma punktami stoi w miejscu,
// wiec nie ma po co jej automatyzowac.
function maRuch(s){
  const mo=s.motion;
  if(!mo||mo.mode==='static') return false;
  if(mo.mode==='path') return (mo.waypoints||[]).length>=2;
  return true;
}

// Zwraca { xs, ys, frames, dt } — pozycje zrodla co 1/fps sekundy przez `dur` sekund.
// Stan ruchu jest KOPIOWANY (mo, waypoints), wiec symulacja nie rusza obiektu na ekranie.
function simulateTrajectory(s,dur,fps){
  const dt=1/fps, frames=Math.max(2,Math.round(dur*fps)+1), m=S.worldSize-1;
  const xs=new Float64Array(frames), ys=new Float64Array(frames);
  const mo=Object.assign({},s.motion,{ waypoints:(s.motion.waypoints||[]).map(w=>({x:w.x,y:w.y})) });
  const rnd=makeRng(mo.seed);
  const pos={ x:s.x, y:s.y };
  for(let i=0;i<frames;i++){
    xs[i]=pos.x; ys[i]=pos.y;
    stepMotion(mo,pos,dt,m,rnd);
  }
  return { xs, ys, frames, dt };
}

// Automatyzacja jednego AudioParam wzdluz trajektorii. Rampa LINIOWA, nie skok:
// przy 50 klatkach na sekunde setValueAtTime slychac jako trzaski, bo wartosc przeskakuje
// skokowo w jednej probce. linearRampToValueAtTime daje odcinkami liniowa, ciagla obwiednie.
// Pierwsza klatka musi byc setValueAtTime — rampa potrzebuje poprzedzajacego zdarzenia.
function rampParam(param,valueAt,tr){
  param.setValueAtTime(valueAt(0),0);
  for(let i=1;i<tr.frames;i++) param.linearRampToValueAtTime(valueAt(i),i*tr.dt);
}

// DATE HANDLING
export function initDateHandling(){
  (function(){ const chk=$('kpoDateManual'), inp=$('kpoDate'), lbl=$('kpoDateAuto');
    function syncDateUI(){ const manual=chk.checked; inp.disabled=!manual; if(manual){if(!inp.value)inp.value=new Date().toISOString().slice(0,10);lbl.textContent='';} else{const d=S.sceneCreatedAt||new Date();lbl.textContent=d.toLocaleDateString('pl-PL');inp.value='';} }
    chk.addEventListener('change', syncDateUI); syncDateUI();
    window._getDate=function(){ if($('kpoDateManual').checked&&$('kpoDate').value) return new Date($('kpoDate').value).toLocaleDateString('pl-PL'); return (S.sceneCreatedAt||new Date()).toLocaleDateString('pl-PL'); };
    window._getDateFull=function(){ if($('kpoDateManual').checked&&$('kpoDate').value) return new Date($('kpoDate').value).toLocaleDateString('pl-PL'); return (S.sceneCreatedAt||new Date()).toLocaleString('pl-PL'); };
  })();
}

export { stepMotion, updateMotion, makeRng, maRuch, simulateTrajectory, rampParam };
