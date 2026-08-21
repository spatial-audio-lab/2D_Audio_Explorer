import { $, S, compassNeedle, hudPos, hudRot, selDist, selAbsorb } from './dom-state.js';
import { showToast } from './ui.js';

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function resumeCtx(){ if(audioCtx.state==='suspended') audioCtx.resume(); }
document.addEventListener('click', resumeCtx, {once:true});
document.addEventListener('touchstart', resumeCtx, {once:true});

// MASTER BUS + CONVOLUTION REVERB
const masterGain = audioCtx.createGain();
masterGain.gain.value = 1.0;
masterGain.connect(audioCtx.destination);
const reverbInput = audioCtx.createGain();
const reverbConvolver = audioCtx.createConvolver();
reverbConvolver.normalize = true;
const reverbOutput = audioCtx.createGain();
reverbOutput.gain.value = 0.35;
reverbInput.connect(reverbConvolver);
reverbConvolver.connect(reverbOutput);
reverbOutput.connect(masterGain);
const reverbPreFilter = audioCtx.createBiquadFilter();
reverbPreFilter.type = 'highpass';
reverbPreFilter.frequency.value = 250;
reverbPreFilter.Q.value = 0.7;
reverbInput.disconnect();
reverbInput.connect(reverbPreFilter);
reverbPreFilter.connect(reverbConvolver);

const reverbState = { enabled: true, wet: 0.35, roomSize: 0.6, damping: 0.5, masterVol: 1.0 };

function generateIR(roomSize, damping){
  const sr=audioCtx.sampleRate, rt60=0.3+roomSize*3.7, len=Math.ceil(sr*rt60);
  const buf=audioCtx.createBuffer(2,len,sr), L=buf.getChannelData(0), R=buf.getChannelData(1);
  const dampFreq=12000-damping*10000;
  let lpL=0, lpR=0;
  const lpCoeff=Math.exp(-2*Math.PI*dampFreq/sr);
  for(let i=0;i<len;i++){
    const t=i/sr, env=Math.exp(-6.908*t/rt60);
    const u1=Math.random()||0.0001, u2=Math.random();
    const nL=Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2)*env;
    const nR=Math.sqrt(-2*Math.log(u1))*Math.sin(2*Math.PI*u2)*env;
    lpL=nL+lpCoeff*(lpL-nL); lpR=nR+lpCoeff*(lpR-nR);
    L[i]=lpL; R[i]=lpR;
  }
  const erEnd=Math.min(Math.ceil(sr*0.08),len), erCount=6+Math.floor(roomSize*10);
  for(let k=0;k<erCount;k++){
    const pos=Math.floor(Math.random()*erEnd), amp=(0.3+Math.random()*0.7)*Math.exp(-pos/(sr*0.03));
    L[pos]+=amp*(Math.random()>0.5?1:-1); R[pos]+=amp*(Math.random()>0.5?1:-1);
  }
  return buf;
}
function updateReverb(){
  reverbConvolver.buffer = generateIR(reverbState.roomSize, reverbState.damping);
  reverbOutput.gain.setTargetAtTime(reverbState.enabled ? reverbState.wet : 0, audioCtx.currentTime, 0.05);
}
updateReverb();
const _hrtfWarmup = new PannerNode(audioCtx, { panningModel:'HRTF' });
_hrtfWarmup.disconnect();

let compassRotation = 0;

// AUDIO ENGINE — Dual-panner + elevation + air absorption
function configurePanner(p){
  p.panningModel='HRTF'; p.distanceModel='inverse'; p.refDistance=1; p.maxDistance=50; p.rolloffFactor=1;
}

function buildSrc(id, name, x, y, vol, libId){
  if(!S.sceneCreatedAt) S.sceneCreatedAt = new Date();
  const gain=audioCtx.createGain(); gain.gain.value=vol; gain.channelCount=2; gain.channelCountMode='explicit'; gain.channelInterpretation='speakers';
  const airFilter=audioCtx.createBiquadFilter(); airFilter.type='lowpass'; airFilter.frequency.value=20000; airFilter.Q.value=0.5;
  const splitter=audioCtx.createChannelSplitter(2);
  const pannerL=audioCtx.createPanner(); configurePanner(pannerL);
  const pannerR=audioCtx.createPanner(); configurePanner(pannerR);
  const reverbSend=audioCtx.createGain(); reverbSend.gain.value=0;
  // Chain: gain → airFilter → splitter → pannerL/R → masterGain
  gain.connect(airFilter); airFilter.connect(splitter);
  splitter.connect(pannerL, 0); splitter.connect(pannerR, 1);
  pannerL.connect(masterGain); pannerR.connect(masterGain);
  // Reverb send tapped from gain (pre-absorption for richer reverb)
  gain.connect(reverbSend); reverbSend.connect(reverbInput);
  const s = {
    id, name, x, y, height:0, volume:vol,
    routing:'spatial', width:0, spreadAngle:0,
    playing:false, node:null,
    gain, airFilter, splitter, pannerL, pannerR, reverbSend,
    libraryId:libId||null, isStream:false, audioElement:null, mediaSource:null,
    attrAuthor:null, attrLicense:null, attrUrl:null,
    motion:{ mode:'static', speed:2, orbitRadius:5, orbitAngle:0, originX:x, originY:y,
      randomRange:8, randomTX:x, randomTY:y, randomTimer:0,
      // Ziarno generatora dla trybu Random. Ruch NA EKRANIE zostaje losowy (Math.random
      // w updateMotion), ale symulacja na potrzeby eksportu idzie z tego ziarna — dzieki
      // temu dwa eksporty tej samej sceny daja ten sam plik i da sie je porownac.
      seed:(Math.random()*4294967296)>>>0,
      waypoints:[], pathIndex:0, pathLoop:true, pathDir:1 }
  };
  updPanners(s); updateReverbSend(s);
  return s;
}

function setRouting(s, mode){
  if(s.routing===mode) return;
  try{s.gain.disconnect();}catch(e){}
  try{s.airFilter.disconnect();}catch(e){}
  try{s.splitter.disconnect();}catch(e){}
  try{s.pannerL.disconnect();}catch(e){}
  try{s.pannerR.disconnect();}catch(e){}
  try{s.reverbSend.disconnect();}catch(e){}
  if(mode==='direct'){
    s.gain.connect(masterGain);
  } else {
    s.gain.connect(s.airFilter); s.airFilter.connect(s.splitter);
    s.splitter.connect(s.pannerL, 0); s.splitter.connect(s.pannerR, 1);
    s.pannerL.connect(masterGain); s.pannerR.connect(masterGain);
    s.gain.connect(s.reverbSend); s.reverbSend.connect(reverbInput);
    updPanners(s); updateReverbSend(s);
  }
  s.routing=mode;
}

function setPos(panner, wx, wy, wh){
  if(panner.positionX){
    panner.positionX.setValueAtTime(wx, audioCtx.currentTime);
    panner.positionY.setValueAtTime(wh||0, audioCtx.currentTime);
    panner.positionZ.setValueAtTime(wy, audioCtx.currentTime);
  } else panner.setPosition(wx, wh||0, wy);
}

function updPanners(s){
  const halfW=s.width/2, rad=(s.spreadAngle||0)*Math.PI/180;
  const dx=halfW*Math.cos(rad), dy=halfW*Math.sin(rad), h=s.height||0;
  setPos(s.pannerL, s.x-dx, s.y-dy, h);
  setPos(s.pannerR, s.x+dx, s.y+dy, h);
}

function updateReverbSend(s){
  if(s.routing==='direct'||!reverbState.enabled){ s.reverbSend.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05); return; }
  const dist=Math.sqrt((s.x-S.listener.x)**2+(s.y-S.listener.y)**2+(s.height||0)**2);
  const send=Math.min(0.7, 0.05+0.65*(1-1/(1+dist*0.12)));
  s.reverbSend.gain.setTargetAtTime(send, audioCtx.currentTime, 0.08);
}

function updateAirAbsorption(){
  const t=audioCtx.currentTime;
  for(const s of S.sources){
    if(!s.airFilter||s.routing==='direct') continue;
    const dist3d=Math.sqrt((s.x-S.listener.x)**2+(s.y-S.listener.y)**2+(s.height||0)**2);
    const cutoff=Math.max(400, 20000*Math.exp(-dist3d*0.06));
    s.airFilter.frequency.setTargetAtTime(cutoff, t, 0.04);
    if(s===S.selectedSource){
      selDist.textContent=dist3d.toFixed(1)+'m';
      const pct=Math.round((1-cutoff/20000)*100);
      selAbsorb.textContent=cutoff>=19000?'—':Math.round(cutoff)+'Hz ('+pct+'%)';
    }
  }
}

function updateListener(){
  const l=audioCtx.listener, rad=S.listener.angle*Math.PI/180;
  if(l.positionX){
    l.positionX.setValueAtTime(S.listener.x,audioCtx.currentTime); l.positionY.setValueAtTime(0,audioCtx.currentTime); l.positionZ.setValueAtTime(S.listener.y,audioCtx.currentTime);
    l.forwardX.setValueAtTime(Math.sin(rad),audioCtx.currentTime); l.forwardY.setValueAtTime(0,audioCtx.currentTime); l.forwardZ.setValueAtTime(-Math.cos(rad),audioCtx.currentTime);
    l.upX.setValueAtTime(0,audioCtx.currentTime); l.upY.setValueAtTime(1,audioCtx.currentTime); l.upZ.setValueAtTime(0,audioCtx.currentTime);
  } else { l.setPosition(S.listener.x,0,S.listener.y); l.setOrientation(Math.sin(rad),0,-Math.cos(rad),0,1,0); }
  hudPos.textContent=S.listener.x.toFixed(1)+', '+S.listener.y.toFixed(1);
  hudRot.textContent=Math.round(S.listener.angle)+'°';
  const ta=-S.listener.angle; let d=ta-compassRotation; while(d>180)d-=360; while(d<-180)d+=360; compassRotation+=d;
  compassNeedle.style.transform='rotate('+compassRotation+'deg)';
}

// COMPASS — klik wyśrodkowuje scenę i obraca słuchacza na północ

function recenterListener(){ S.listener.x=0; S.listener.y=0; S.listener.angle=0; S.target=null; updateListener(); showToast('◎ Wyśrodkowano — kierunek północny'); }
export function initAudioEngine(){
  $('compassBtn').addEventListener('click', recenterListener);
  $('compassBtn').addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); recenterListener(); } });
}

export { audioCtx, masterGain, reverbInput, reverbConvolver, reverbOutput, reverbPreFilter, reverbState, generateIR, updateReverb, configurePanner, buildSrc, setRouting, setPos, updPanners, updateReverbSend, updateAirAbsorption, updateListener, recenterListener };
