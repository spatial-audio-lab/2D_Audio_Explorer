// 50-zrodlo.js — Model zrodla dzwieku i jego graf wezlow: budowa, routing, pannery, wysylka
// do poglosu, absorpcja powietrza, sluchacz, wczytywanie plikow z dysku.
// Czesc Sceny rozbitej na klasyczne skrypty. Kolejnosc ladowania jest kontraktem:
// patrz lista <script> na koncu index.html.

function applyAttr(src, def){
  if(!src) return;
  // Biblioteka podaje autora tylko przy licencjach wymagajacych uznania autorstwa,
  // ale zrodlo warto zapisac zawsze — przy CC0 tez wypada podac, skad sie wzielo.
  if(def.author) src.attrAuthor=def.author;
  if(def.freesound_url) src.attrUrl=def.freesound_url;
  if(def.license) src.attrLicense=def.license.name || (def.license.attribution?'CC BY':'CC0');
}
async function loadFromLib(def, btn){
  const row=btn?btn.closest('.lib-sound'):null;
  if(btn){ btn.classList.add('loading'); btn.textContent='…'; }
  if(row) row.classList.add('is-loading');
  showToast('⏳ Pobieranie: '+def.label, 8000);
  try {
    const angle=Math.random()*Math.PI*2, dist=4+Math.random()*8;
    const x=Math.cos(angle)*dist, y=Math.sin(angle)*dist;
    if(def.file){ try { const r=await fetch(def.file); if(r.ok){ const ab=await r.arrayBuffer(); const d=await audioCtx.decodeAudioData(ab); applyAttr(createFromBuffer(d,def.label,x,y,def.id,def.defaultVolume||0.7),def); showToast('✓ '+def.label); return; } } catch(e){} }
    if(def.preview_url){ try { const r=await fetch(def.preview_url); if(r.ok){ const ab=await r.arrayBuffer(); const d=await audioCtx.decodeAudioData(ab); applyAttr(createFromBuffer(d,def.label,x,y,def.id,def.defaultVolume||0.7),def); showToast('✓ '+def.label); return; } } catch(e){ applyAttr(await createFromStream(def.preview_url,def.label,x,y,def.id,def.defaultVolume||0.7),def); showToast('✓ '+def.label+' (bez HRTF)'); return; } }
    throw new Error('Brak źródła');
  } catch(err){ showToast('⚠ Nie udało się pobrać: '+def.label); if(btn){btn.classList.remove('loading');btn.textContent='+';} } finally { if(row) row.classList.remove('is-loading'); updateLibBtns(); }
}

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
    // orbitAngle to kat na okregu w konwencji parametrycznej (0 = wschod, rosnie zgodnie
    // z ruchem wskazowek na ekranie). Domyslne -PI/2 stawia dzwiek na POLNOCY, czyli
    // przed sluchaczem — to samo, co 0 na suwaku Start.
    // orbitPeriod to czas PELNEGO obiegu w sekundach. Wczesniej okres wynikal z dzielenia
    // predkosci przez promien i przy domyslnych ustawieniach wychodzil 15,71 s — liczba,
    // ktorej nikt nie wybral. `speed` zostaje dla trybow random i sciezka.
    // orbitStart to PARAMETR: stopnie od polnocy, ujemne w lewo. Od niego zaczyna sie
    // odsluch i nagranie. orbitAngle to tylko stan biegu — dryfuje w trakcie grania
    // i nie wolno go czytac jako "startu", bo panel zaczyna wtedy klamac.
    motion:{ mode:'static', speed:2, orbitRadius:5, orbitStart:0, orbitAngle:-Math.PI/2, orbitPeriod:10, originX:x, originY:y,
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
$('compassBtn').addEventListener('click', recenterListener);
$('compassBtn').addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); recenterListener(); } });

// Nazwa pliku z dysku bywa dluga i techniczna ("freesound_512345__autor__pociag-nocny.wav").
// Do sceny wchodzi wersja bez rozszerzenia, bez podkreslen i bez numerycznego prefiksu —
// zawsze mozna ja poprawic recznie w panelu Wybrany.
function cleanFileName(name){
  let n=String(name).replace(/\.[^.\s]+$/,'');
  n=n.replace(/^\d+[\s_-]+/,'').replace(/[_]+/g,' ').replace(/\s+/g,' ').trim();
  if(n.length>40) n=n.slice(0,39).trim()+'…';
  return n||'Dźwięk';
}

function createFromBuffer(decoded, name, x, y, libId=null, vol=0.7){
  const id='s'+Date.now()+'_'+Math.random().toString(36).slice(2,7);
  S.buffers[id]=decoded;
  const s=buildSrc(id, name, x, y, vol, libId);
  S.sources.push(s); renderSources(); return s;
}
async function createFromStream(url, name, x, y, libId=null, vol=0.7){
  const id='s'+Date.now()+'_'+Math.random().toString(36).slice(2,7);
  const a=new Audio(); a.crossOrigin='anonymous'; a.loop=true; a.preload='auto'; a.src=url;
  await new Promise((ok,fail)=>{a.addEventListener('canplay',ok,{once:true});a.addEventListener('error',()=>fail(new Error('Load error')),{once:true});setTimeout(()=>fail(new Error('Timeout')),15000);});
  const ms=audioCtx.createMediaElementSource(a);
  const s=buildSrc(id, name, x, y, vol, libId); s.isStream=true; s.audioElement=a; s.mediaSource=ms; ms.connect(s.gain);
  S.sources.push(s); renderSources(); return s;
}

// FILES
$('pickFiles').addEventListener('click', ()=>fileInput.click());
fileDrop.addEventListener('click', ()=>fileInput.click());
fileDrop.addEventListener('dragover', e=>{ e.preventDefault(); fileDrop.classList.add('dragover'); });
fileDrop.addEventListener('dragleave', ()=>fileDrop.classList.remove('dragover'));
fileDrop.addEventListener('drop', e=>{ e.preventDefault(); fileDrop.classList.remove('dragover'); handleFiles(e.dataTransfer.files); });
fileInput.addEventListener('change', ()=>{ handleFiles(fileInput.files); fileInput.value=''; });
async function handleFiles(files){
  let n=0;
  for(const f of files){ try { if(!S.sceneCreatedAt) S.sceneCreatedAt=new Date(f.lastModified||Date.now()); const b=await f.arrayBuffer(); const d=await audioCtx.decodeAudioData(b); const a=Math.random()*Math.PI*2, r=4+Math.random()*10; createFromBuffer(d, cleanFileName(f.name), Math.cos(a)*r, Math.sin(a)*r); n++; } catch(e){ showToast('⚠ '+f.name); } }
  if(n) showToast('Dodano '+n+' plik(ów)');
}

// PLAY / STOP / REMOVE / SELECT
function playSource(s){
  if(!s||s.playing) return;
  if(s.motion.mode==='orbit') wrocNaStartOrbity(s);
  if(s.isStream && s.audioElement){ audioCtx.resume().then(()=>s.audioElement.play()); s.playing=true; }
  else if(!s.isStream && S.buffers[s.id]){ s.node=audioCtx.createBufferSource(); s.node.buffer=S.buffers[s.id]; s.node.loop=true; s.node.connect(s.gain); s.node.start(); s.playing=true; }
  renderSources(); updateCounters();
}
function stopSource(s){
  if(!s||!s.playing) return;
  if(s.motion.mode==='orbit') wrocNaStartOrbity(s);
  if(s.isStream && s.audioElement){ s.audioElement.pause(); s.audioElement.currentTime=0; }
  else if(s.node){ try{s.node.stop();}catch(e){} s.node=null; }
  s.playing=false; renderSources(); updateCounters();
}
function removeSource(id){
  const i=S.sources.findIndex(s=>s.id===id); if(i===-1) return;
  const s=S.sources[i]; stopSource(s);
  if(S.selectedSource===s){ S.selectedSource=null; updateSel(); }
  s.gain.disconnect(); try{s.airFilter.disconnect();}catch(e){} try{s.splitter.disconnect();}catch(e){}
  try{s.pannerL.disconnect();}catch(e){} try{s.pannerR.disconnect();}catch(e){}
  try{s.reverbSend.disconnect();}catch(e){}
  if(s.audioElement) s.audioElement.src='';
  delete S.buffers[id]; S.sources.splice(i,1); renderSources(); updateLibBtns(); showToast('Usunięto');
}
function selectSource(s){ S.selectedSource=s; updateSel(); renderSources(); syncSubStates(); }
