// 00-audio.js — Kontekst audio, szyna master, poglos konwolucyjny.
// Nic tu nie zalezy od DOM, dlatego idzie pierwszy.
// Czesc Sceny rozbitej na klasyczne skrypty. Kolejnosc ladowania jest kontraktem:
// patrz lista <script> na koncu index.html.

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
