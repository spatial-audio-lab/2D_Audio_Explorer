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
const S = {
  mode:'edit', sceneName:null, sceneCreatedAt:null,
  listener:{x:0,y:0,angle:0}, target:null,
  sources:[], buffers:{}, selectedSource:null, keys:{},
  worldSize:25, moveSpeed:6, rotSpeed:90, dragStartAngle:0
};
let libraryData = null, libSearchQuery = '';

const $ = id => document.getElementById(id);
const app=$('app'), mainCanvas=$('mainCanvas'), ctx=mainCanvas.getContext('2d');
const minimapCanvas=$('minimapCanvas'), minimapCtx=minimapCanvas.getContext('2d');
const compassNeedle=$('compassNeedle'), hudPos=$('hudPos'), hudRot=$('hudRot'), hudSrc=$('hudSrc');
const targetIndicator=$('targetIndicator'), toastEl=$('toast');
const fileInput=$('fileInput'), fileDrop=$('fileDrop');
const sourcesList=$('sourcesList'), selName=$('selName');
const selAuthor=$('selAuthor'), selLicense=$('selLicense'), selUrl=$('selUrl'), attrState=$('attrState');
const volSlider=$('volSlider'), volVal=$('volVal');
const heightSlider=$('heightSlider'), heightVal=$('heightVal'), selDist=$('selDist'), selAbsorb=$('selAbsorb');
const widthSlider=$('widthSlider'), widthVal=$('widthVal');
const angleSlider=$('angleSlider'), angleVal=$('angleVal');
const stereoInd=$('stereoInd'), spatialSection=$('spatialSection');
const routingToggle=$('routingToggle'), motionModeRow=$('motionModeRow');
const motionSpeed=$('motionSpeed'), motionSpeedVal=$('motionSpeedVal');
const orbitRadiusEl=$('orbitRadius'), orbitRadiusVal=$('orbitRadiusVal');
const randomRangeEl=$('randomRange'), randomRangeVal=$('randomRangeVal');
const pathLoopEl=$('pathLoop'), pathLoopVal=$('pathLoopVal');
const orbitParams=$('orbitParams'), randomParams=$('randomParams'), pathParams=$('pathParams');
const libPanel=$('libraryPanel'), libTree=$('libTree'), libSearch=$('libSearch'), libCountBadge=$('libCountBadge');

function showToast(m, d=2500){ toastEl.textContent=m; toastEl.classList.add('show'); setTimeout(()=>toastEl.classList.remove('show'),d); }

// --- POTWIERDZENIE DZIALANIA NIEODWRACALNEGO -------------------------------------------
// Zwraca Promise<boolean>. Escape i klikniecie w tlo = "nie" — domyslna odpowiedz zawsze
// jest ta bezpieczna. Fokus laduje na przycisku odmowy, wiec sam Enter niczego nie skasuje.
function askConfirm({ title='Uwaga', text='Na pewno?', sub='', yes='Tak', no='Nie' }){
  return new Promise(resolve=>{
    const ov=$('confirmOverlay'), btnYes=$('confirmYes'), btnNo=$('confirmNo');
    $('confirmTitle').textContent=title;
    $('confirmText').textContent=text;
    const subEl=$('confirmSub'); subEl.textContent=sub; subEl.style.display=sub?'':'none';
    btnYes.textContent=yes; btnNo.textContent=no;
    const prevFocus=document.activeElement;
    function close(v){
      ov.classList.remove('show');
      btnYes.removeEventListener('click',onYes); btnNo.removeEventListener('click',onNo);
      ov.removeEventListener('mousedown',onBack); document.removeEventListener('keydown',onKey,true);
      if(prevFocus && prevFocus.focus) { try{ prevFocus.focus(); }catch(e){} }
      resolve(v);
    }
    function onYes(){ close(true); }
    function onNo(){ close(false); }
    function onBack(e){ if(e.target===ov) close(false); }
    function onKey(e){
      if(e.key==='Escape'){ e.preventDefault(); close(false); }
      // Fokus nie ma jak uciec poza okno — Tab krazy miedzy dwoma przyciskami.
      if(e.key==='Tab'){ e.preventDefault(); (document.activeElement===btnNo?btnYes:btnNo).focus(); }
    }
    btnYes.addEventListener('click',onYes); btnNo.addEventListener('click',onNo);
    ov.addEventListener('mousedown',onBack); document.addEventListener('keydown',onKey,true);
    ov.classList.add('show');
    btnNo.focus();
  });
}

// ACCORDION
function toggleAccHead(h){ const collapsed=h.classList.toggle('collapsed'); h.setAttribute('aria-expanded', collapsed?'false':'true'); }
document.querySelectorAll('.acc-head').forEach(h => {
  h.addEventListener('click', () => toggleAccHead(h));
  h.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' '){ e.preventDefault(); toggleAccHead(h); } });
});

// CANVAS
function resizeCanvases(){
  const r=mainCanvas.parentElement.getBoundingClientRect(), dpr=devicePixelRatio||1;
  mainCanvas.width=r.width*dpr; mainCanvas.height=r.height*dpr;
  mainCanvas.style.width=r.width+'px'; mainCanvas.style.height=r.height+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
  minimapCanvas.width=120*dpr; minimapCanvas.height=120*dpr;
  minimapCtx.setTransform(dpr,0,0,dpr,0,0);
}
addEventListener('resize', resizeCanvases); resizeCanvases();

// MODE SWITCH
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

// LIBRARY
$('libToggle').addEventListener('click', () => { const c=libPanel.classList.toggle('collapsed'); if(!c && !libraryData) loadLibrary(); });
const catIcons = {nature:'∿', mood:'◐'};
const subIcons = {nature_water:'≋', nature_fire:'△', nature_birds:'♪', nature_insects:'⁘', nature_mammals:'◦', mood_calm:'○'};
async function loadLibrary(){
  libTree.innerHTML='<div class="lib-empty-msg">Ładowanie…</div>';
  try { const r=await fetch('library.json'); if(!r.ok) throw new Error('HTTP '+r.status); libraryData=await r.json(); libCountBadge.textContent=(libraryData.total_sounds||0)+' dźwięków'; renderLibTree(); }
  catch(e){ libTree.innerHTML='<div class="lib-empty-msg">Nie można załadować library.json</div>'; }
}
function renderLibTree(){
  if(!libraryData) return;
  const q=libSearchQuery.toLowerCase().trim();
  let html='';
  for(const cat of libraryData.categories){
    let subs=[];
    for(const sub of (cat.subcategories||[])){
      const sounds=(sub.sounds||[]).filter(s => { if(!q) return true; return s.label.toLowerCase().includes(q)||(s.tags||[]).some(t=>t.toLowerCase().includes(q))||s.author.toLowerCase().includes(q); });
      if(!sounds.length) continue;
      const sh=sounds.map(s => {
        const dur=s.duration?Math.round(s.duration)+'s':'', lic=s.license?.short||'?', licCls=lic==='CC0'?'cc0':'', isStream=!s.file;
        const attr=s.license?.attribution?`<div class="lib-sound-attr">© <a href="${s.freesound_url}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${s.author}</a></div>`:'';
        return `<div class="lib-sound"><div><div class="lib-sound-name" title="${s.label}">${s.label}</div><div class="lib-sound-meta">${dur?'<span>'+dur+'</span>':''}<span class="lib-badge ${licCls}">${lic}</span>${isStream?'<span class="lib-badge stream">Stream</span>':''}</div>${attr}<div class="lib-sound-status">⏳ Pobieranie…</div></div><button class="lib-add-btn" data-add="${s.id}">+</button></div>`;
      }).join('');
      subs.push(`<div><div class="lib-sub-head" data-tsub="${sub.id}" role="button" tabindex="0" aria-expanded="true"><i class="ico">${subIcons[sub.id]||'·'}</i><span>${sub.label}</span><span class="cnt">${sounds.length}</span><span class="arrow">▾</span></div><div class="lib-sub-body" id="sub-${sub.id}">${sh}</div></div>`);
    }
    if(!subs.length) continue;
    html+=`<div class="lib-cat"><div class="lib-cat-head" data-tcat="${cat.id}" role="button" tabindex="0" aria-expanded="true"><i class="ico">${catIcons[cat.id]||'◈'}</i><span class="label">${cat.label}</span><span class="cnt">${subs.length}</span><span class="arrow">▾</span></div><div class="lib-cat-body" id="cat-${cat.id}">${subs.join('')}</div></div>`;
  }
  if(!html){ libTree.innerHTML='<div class="lib-empty-msg">Brak wyników</div>'; return; }
  libTree.innerHTML=html;
  function toggleTreeHead(el, bodyId){ const collapsed=el.classList.toggle('collapsed'); el.setAttribute('aria-expanded', collapsed?'false':'true'); document.getElementById(bodyId).style.display=collapsed?'none':''; }
  libTree.querySelectorAll('[data-tcat]').forEach(el => { const fn=()=>toggleTreeHead(el,'cat-'+el.dataset.tcat); el.addEventListener('click', fn); el.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); fn(); } }); });
  libTree.querySelectorAll('[data-tsub]').forEach(el => { const fn=()=>toggleTreeHead(el,'sub-'+el.dataset.tsub); el.addEventListener('click', fn); el.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); fn(); } }); });
  libTree.querySelectorAll('[data-add]').forEach(btn => btn.addEventListener('click', async e => { e.stopPropagation(); if(btn.classList.contains('in-scene')||btn.classList.contains('loading')) return; const snd=findInLib(btn.dataset.add); if(snd) await loadFromLib(snd,btn); }));
  updateLibBtns();
}
function findInLib(id){ if(!libraryData) return null; for(const c of libraryData.categories) for(const s of (c.subcategories||[])) for(const x of (s.sounds||[])) if(x.id===id) return x; return null; }
function updateLibBtns(){ const ids=new Set(S.sources.map(s=>s.libraryId).filter(Boolean)); libTree.querySelectorAll('[data-add]').forEach(b=>{ if(ids.has(b.dataset.add)){b.classList.add('in-scene');b.classList.remove('loading');b.textContent='✓';}else{b.classList.remove('in-scene');if(!b.classList.contains('loading'))b.textContent='+';}}); }
libSearch.addEventListener('input', () => { libSearchQuery=libSearch.value; if(libraryData) renderLibTree(); });

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
  if(s.isStream && s.audioElement){ audioCtx.resume().then(()=>s.audioElement.play()); s.playing=true; }
  else if(!s.isStream && S.buffers[s.id]){ s.node=audioCtx.createBufferSource(); s.node.buffer=S.buffers[s.id]; s.node.loop=true; s.node.connect(s.gain); s.node.start(); s.playing=true; }
  renderSources(); updateCounters();
}
function stopSource(s){
  if(!s||!s.playing) return;
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
function updateSel(){
  const s=S.selectedSource;
  if(s){
    selName.value=s.name; selName.disabled=false; selName.classList.remove('empty');
    selAuthor.value=s.attrAuthor||''; selLicense.value=s.attrLicense||''; selUrl.value=s.attrUrl||'';
    selAuthor.disabled=false; selLicense.disabled=false; selUrl.disabled=false;
    syncAttrState(s);
    volSlider.value=Math.round(s.volume*100); volVal.textContent=volSlider.value+'%';
    heightSlider.value=Math.round((s.height||0)*10); heightVal.textContent=(s.height||0).toFixed(1)+'m';
    widthSlider.value=Math.round(s.width*10); widthVal.textContent=s.width.toFixed(1)+'m';
    angleSlider.value=Math.round(s.spreadAngle); angleVal.textContent=Math.round(s.spreadAngle)+'°';
    stereoInd.textContent=s.width>0.05?'Stereo':'Punkt'; stereoInd.classList.toggle('wide',s.width>0.05);
    routingToggle.querySelectorAll('.routing-btn').forEach(b=>{ b.classList.remove('active','active-direct'); if(b.dataset.route===s.routing) b.classList.add(s.routing==='direct'?'active-direct':'active'); });
    spatialSection.classList.toggle('disabled',s.routing==='direct');
    const mo=s.motion;
    motionModeRow.querySelectorAll('.motion-mode-btn').forEach(b=>b.classList.toggle('active',b.dataset.motion===mo.mode));
    motionSpeed.value=Math.round(mo.speed*10); motionSpeedVal.textContent=mo.speed.toFixed(1);
    orbitRadiusEl.value=Math.round(mo.orbitRadius*10); orbitRadiusVal.textContent=mo.orbitRadius.toFixed(1)+'m';
    randomRangeEl.value=Math.round(mo.randomRange*10); randomRangeVal.textContent=mo.randomRange.toFixed(1)+'m';
    pathLoopEl.value=mo.pathLoop?1:0; pathLoopVal.textContent=mo.pathLoop?'Tak':'Nie';
    orbitParams.classList.toggle('open',mo.mode==='orbit'); randomParams.classList.toggle('open',mo.mode==='random'); pathParams.classList.toggle('open',mo.mode==='path');
  } else {
    selName.value=''; selName.disabled=true; selName.classList.add('empty'); selDist.textContent='—'; selAbsorb.textContent='—';
    selAuthor.value=''; selLicense.value=''; selUrl.value='';
    selAuthor.disabled=true; selLicense.disabled=true; selUrl.disabled=true;
    attrState.textContent='—';
    widthSlider.value=0; widthVal.textContent='0.0m'; angleSlider.value=0; angleVal.textContent='0°';
    stereoInd.textContent='Punkt'; stereoInd.classList.remove('wide');
    routingToggle.querySelectorAll('.routing-btn').forEach(b=>b.classList.remove('active','active-direct'));
    routingToggle.querySelector('[data-route="spatial"]').classList.add('active');
    spatialSection.classList.remove('disabled');
    motionModeRow.querySelectorAll('.motion-mode-btn').forEach(b=>b.classList.toggle('active',b.dataset.motion==='static'));
    orbitParams.classList.remove('open'); randomParams.classList.remove('open'); pathParams.classList.remove('open');
  }
}

// RENDER SOURCE LIST
function renderSources(){
  $('accSrcCount').textContent=String(S.sources.length);
  hudSrc.textContent=S.sources.length;
  if(!S.sources.length){ sourcesList.innerHTML='<div class="sources-empty">Brak źródeł dźwięku</div>'; updateCounters(); return; }
  sourcesList.innerHTML=S.sources.map((s,i)=>{
    const d=Math.sqrt((s.x-S.listener.x)**2+(s.y-S.listener.y)**2+(s.height||0)**2).toFixed(1);
    const wTag=s.width>0.05&&s.routing==='spatial'?' · ↔'+s.width.toFixed(1)+'m':'';
    const rTag=s.routing==='direct'?' · direct':'';
    const mTag=s.motion.mode!=='static'?' · '+s.motion.mode:'';
    const hAbs=Math.abs(s.height||0);
    const hTag=hAbs>0.2?' · '+(s.height>0?'↑':'↓')+hAbs.toFixed(1)+'m':'';
    return `<div class="source-item ${S.selectedSource===s?'selected':''} ${s.playing?'playing':''}" data-id="${s.id}" role="button" tabindex="0" aria-label="Zaznacz źródło ${s.name}"><div class="src-num">${i+1}</div><div class="src-info"><div class="src-name">${s.name}</div><div class="src-meta">${d}m · ${Math.round(s.volume*100)}%${hTag}${wTag}${rTag}${mTag}${s.isStream?' · stream':''}</div></div><button class="src-btn ${s.playing?'active':''}" data-a="t" aria-label="${s.playing?'Zatrzymaj':'Odtwórz'} ${s.name}">${s.playing?'‖':'▶'}</button><button class="src-btn del" data-a="d" aria-label="Usuń ${s.name}">✕</button></div>`;
  }).join('');
  sourcesList.querySelectorAll('.source-item').forEach(el=>{
    const s=S.sources.find(x=>x.id===el.dataset.id);
    el.addEventListener('click', e=>{ if(!e.target.closest('.src-btn')) selectSource(s); });
    el.addEventListener('keydown', e=>{ if((e.key==='Enter'||e.key===' ')&&!e.target.closest('.src-btn')){ e.preventDefault(); selectSource(s); } });
    el.querySelector('[data-a="t"]').addEventListener('click', e=>{ e.stopPropagation(); s.playing?stopSource(s):playSource(s); });
    el.querySelector('[data-a="d"]').addEventListener('click', async e=>{
      e.stopPropagation();
      const ok=await askConfirm({
        title:'Kasowanie dźwięku',
        text:'Próbujesz skasować dźwięk ze sceny. Czy tego chcesz?',
        sub:s.name+' — tej operacji nie da się cofnąć.',
        yes:'Tak, skasuj', no:'Nie, zostaw'
      });
      if(ok){ removeSource(s.id); showToast('✕ Skasowano: '+s.name); }
    });
  });
  updateCounters();
}
function updateCounters(){
  const p=S.sources.filter(s=>s.playing).length;
  $('tSrcCount').textContent=String(S.sources.length).padStart(2,'0');
  $('tPlayCount').textContent=String(p).padStart(2,'0');
  $('tPlayAll').classList.toggle('active',p>0);
  // Stop dostaje ramke crimson dokladnie wtedy, gdy jest co zatrzymac.
  // Po zdjeciu klasy ramka gasnie sama — robi to transition, nie licznik.
  $('tStopAll').classList.toggle('armed',p>0);
}

// CONTROLS
$('playAllBtn').addEventListener('click', ()=>S.sources.forEach(s=>playSource(s)));
$('stopAllBtn').addEventListener('click', ()=>S.sources.forEach(s=>stopSource(s)));
$('tPlayAll').addEventListener('click', ()=>{ S.sources.some(s=>s.playing)?S.sources.forEach(s=>stopSource(s)):S.sources.forEach(s=>playSource(s)); });
$('tStopAll').addEventListener('click', ()=>S.sources.forEach(s=>stopSource(s)));
// Numer sceny jest opcjonalny. Wylaczony — pliki nazywaja sie samym tytulem sceny,
// a numer nie pojawia sie ani w META, ani na mapie JPG.
(function(){
  const cb=$('sceneNumberOn'), inp=$('sceneNumber');
  function sync(){ inp.disabled=!cb.checked; }
  cb.addEventListener('change', sync); sync();
})();

// Wyjasnienia siedza pod znakiem zapytania, zeby nie zajmowac miejsca na stale.
document.querySelectorAll('.q-btn').forEach(b=>{
  b.setAttribute('aria-expanded','false');
  b.addEventListener('click', ()=>{
    const el=$(b.dataset.hint); if(!el) return;
    const open=el.classList.toggle('hidden');
    b.setAttribute('aria-expanded', open?'false':'true');
  });
});

// Naglowki podsekcji pokazuja stan bez rozwijania — dzieki temu zwiniety panel
// nadal mowi, co jest ustawione.
const MOTION_LABEL={static:'Statyczny',orbit:'Orbita',random:'Random',path:'Ścieżka'};
function syncSubStates(){
  const s=S.selectedSource;
  const ms=$('motionState'); if(ms) ms.textContent=s?(MOTION_LABEL[s.motion.mode]||'—'):'—';
  const rs=$('reverbState2');
  if(rs) rs.textContent=reverbState.enabled?('włączony · '+Math.round(reverbState.wet*100)+'%'):'wyłączony';
  const sa=$('sceneAttrState');
  if(sa){
    const parts=[];
    if(($('sceneDesc').value||'').trim()) parts.push('opis');
    if(($('sceneAuthor').value||'').trim()) parts.push(($('sceneAuthor').value||'').trim());
    if(($('sceneLicense').value||'').trim()) parts.push(($('sceneLicense').value||'').trim());
    sa.textContent=parts.length?parts.join(' · '):'nie podano';
  }
  const fo=$('fileOptState');
  if(fo){
    const p=[]; p.push($('exportReverb').checked?'pogłos':'bez pogłosu');
    p.push($('exportMotion').checked?'z ruchem':'bez ruchu');
    p.push($('mapDateOn').checked?'data na mapie':'bez daty');
    fo.textContent=p.join(', ');
  }
}
['sceneDesc','sceneAuthor','sceneLicense'].forEach(id=>$(id).addEventListener('input', syncSubStates));
['exportReverb','exportMotion','mapDateOn'].forEach(id=>$(id).addEventListener('change', syncSubStates));

// Nazwa dzwieku — zmieniana w locie, bez przycisku "zapisz". Pusta wraca do poprzedniej,
// zeby zaden obiekt nie wyladowal na kuli w Sferze bez podpisu.
selName.addEventListener('input', ()=>{
  const s=S.selectedSource; if(!s) return;
  const v=selName.value.trim();
  if(v){ s.name=v; renderSources(); }
});
selName.addEventListener('blur', ()=>{
  const s=S.selectedSource; if(!s) return;
  if(!selName.value.trim()){ selName.value=s.name; }
});
selName.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); selName.blur(); } });

// Autorstwo i licencja pojedynczego dzwieku — zapisywane od razu, bez przycisku.
function syncAttrState(s){
  const parts=[]; if(s.attrAuthor) parts.push(s.attrAuthor); if(s.attrLicense) parts.push(s.attrLicense);
  attrState.textContent=parts.length?parts.join(' · '):'nie podano';
}
[[selAuthor,'attrAuthor'],[selLicense,'attrLicense'],[selUrl,'attrUrl']].forEach(([el,key])=>{
  el.addEventListener('input', ()=>{
    const s=S.selectedSource; if(!s) return;
    s[key]=el.value.trim()||null; syncAttrState(s);
  });
});

volSlider.addEventListener('input', ()=>{ volVal.textContent=volSlider.value+'%'; if(S.selectedSource){ S.selectedSource.volume=volSlider.value/100; S.selectedSource.gain.gain.setValueAtTime(S.selectedSource.volume,audioCtx.currentTime); renderSources(); } });
heightSlider.addEventListener('input', ()=>{ const h=heightSlider.value/10; heightVal.textContent=h.toFixed(1)+'m'; if(S.selectedSource){ S.selectedSource.height=h; updPanners(S.selectedSource); } });
routingToggle.querySelectorAll('.routing-btn').forEach(btn=>{ btn.addEventListener('click', e=>{ e.stopPropagation(); if(!S.selectedSource) return; setRouting(S.selectedSource,btn.dataset.route); updateSel(); renderSources(); showToast(btn.dataset.route==='direct'?'♫ Direct Stereo':'◎ Spatial HRTF'); }); });
widthSlider.addEventListener('input', ()=>{ const w=widthSlider.value/10; widthVal.textContent=w.toFixed(1)+'m'; stereoInd.textContent=w>0.05?'Stereo':'Punkt'; stereoInd.classList.toggle('wide',w>0.05); if(S.selectedSource){ S.selectedSource.width=w; updPanners(S.selectedSource); renderSources(); } });
angleSlider.addEventListener('input', ()=>{ angleVal.textContent=angleSlider.value+'°'; if(S.selectedSource){ S.selectedSource.spreadAngle=parseFloat(angleSlider.value); updPanners(S.selectedSource); } });

// MOTION CONTROLS
motionModeRow.querySelectorAll('.motion-mode-btn').forEach(btn=>{ btn.addEventListener('click', e=>{ e.stopPropagation(); if(!S.selectedSource) return; const mode=btn.dataset.motion, mo=S.selectedSource.motion;
  if((mode==='orbit'||mode==='random')&&mo.mode!==mode){ mo.originX=S.selectedSource.x; mo.originY=S.selectedSource.y; if(mode==='orbit') mo.orbitAngle=0; if(mode==='random'){mo.randomTX=S.selectedSource.x; mo.randomTY=S.selectedSource.y; mo.randomTimer=0;} }
  mo.mode=mode; updateSel(); syncSubStates(); showToast('Ruch: '+{static:'Statyczny',orbit:'Orbita',random:'Random Walk',path:'Ścieżka'}[mode]); }); });
motionSpeed.addEventListener('input', ()=>{ const v=motionSpeed.value/10; motionSpeedVal.textContent=v.toFixed(1); if(S.selectedSource) S.selectedSource.motion.speed=v; });
orbitRadiusEl.addEventListener('input', ()=>{ const v=orbitRadiusEl.value/10; orbitRadiusVal.textContent=v.toFixed(1)+'m'; if(S.selectedSource) S.selectedSource.motion.orbitRadius=v; });
randomRangeEl.addEventListener('input', ()=>{ const v=randomRangeEl.value/10; randomRangeVal.textContent=v.toFixed(1)+'m'; if(S.selectedSource) S.selectedSource.motion.randomRange=v; });
pathLoopEl.addEventListener('input', ()=>{ const v=pathLoopEl.value==='1'; pathLoopVal.textContent=v?'Tak':'Nie'; if(S.selectedSource) S.selectedSource.motion.pathLoop=v; });
$('clearPathBtn').addEventListener('click', e=>{ e.stopPropagation(); if(!S.selectedSource) return; S.selectedSource.motion.waypoints=[]; S.selectedSource.motion.pathIndex=0; S.selectedSource.motion.pathDir=1; showToast('Ścieżka wyczyszczona'); });

// MASTER + REVERB CONTROLS
$('masterVolSlider').addEventListener('input', ()=>{ const v=$('masterVolSlider').value/100; $('masterVolVal').textContent=$('masterVolSlider').value+'%'; reverbState.masterVol=v; masterGain.gain.setTargetAtTime(v,audioCtx.currentTime,0.02); });
function setReverbEnabled(on){
  reverbState.enabled=on;
  const btn=$('reverbEnableBtn'); btn.textContent=on?'Włączony':'Wyłączony'; btn.classList.toggle('active',on); btn.setAttribute('aria-pressed',on?'true':'false');
  reverbOutput.gain.setTargetAtTime(on?reverbState.wet:0,audioCtx.currentTime,0.05);
  syncSubStates();
  for(const s of S.sources) updateReverbSend(s);
}
$('reverbEnableBtn').addEventListener('click', ()=>setReverbEnabled(!reverbState.enabled));
$('reverbWet').addEventListener('input', ()=>{ const v=$('reverbWet').value/100; $('reverbWetVal').textContent=$('reverbWet').value+'%'; reverbState.wet=v; if(reverbState.enabled) reverbOutput.gain.setTargetAtTime(v,audioCtx.currentTime,0.05); syncSubStates(); });
let reverbUpdateTimer=null;
function scheduleReverbUpdate(){ if(reverbUpdateTimer) clearTimeout(reverbUpdateTimer); reverbUpdateTimer=setTimeout(()=>{ updateReverb(); showToast('Reverb zaktualizowany'); },300); }
$('reverbSize').addEventListener('input', ()=>{ const v=$('reverbSize').value/100; $('reverbSizeVal').textContent=v.toFixed(2); reverbState.roomSize=v; scheduleReverbUpdate(); });
$('reverbDamp').addEventListener('input', ()=>{ const v=$('reverbDamp').value/100; $('reverbDampVal').textContent=v.toFixed(2); reverbState.damping=v; scheduleReverbUpdate(); });

// HELP
const helpTabs={basic:['helpTabBasic','helpBasic'],advanced:['helpTabAdvanced','helpAdvanced'],glossary:['helpTabGlossary','helpGlossary'],eco:['helpTabEco','helpEco']};
function setHelpTab(tab){
  for(const key in helpTabs){
    const active=key===tab, [btnId,panelId]=helpTabs[key];
    $(btnId).classList.toggle('active',active); $(btnId).setAttribute('aria-selected',active?'true':'false');
    $(panelId).style.display=active?'':'none';
  }
}
$('helpTabBasic').addEventListener('click', ()=>setHelpTab('basic'));
$('helpTabAdvanced').addEventListener('click', ()=>setHelpTab('advanced'));
$('helpTabGlossary').addEventListener('click', ()=>setHelpTab('glossary'));
$('helpTabEco').addEventListener('click', ()=>setHelpTab('eco'));

// --- PASEK MARKI v3.1: zakladki, modale, burger ---------------------------------------
// Wzorzec i zachowanie 1:1 z implementacja referencyjna (sekwencer, src/js/header.js):
// zakladka z atrybutem data-modal otwiera okno, zamyka je krzyzyk, klik w tlo i Escape,
// a fokus wraca na zakladke, z ktorej okno otwarto.
let ostatniaZakladka = null;
function otworzModal(modal, zrodlo){
  if(!modal) return;
  ostatniaZakladka = zrodlo || document.activeElement;
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden','false');
  const x = modal.querySelector('[data-close-modal]');
  if(x) x.focus();
}
function zamknijModal(modal){
  if(!modal || !modal.classList.contains('is-open')) return;
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden','true');
  if(ostatniaZakladka && typeof ostatniaZakladka.focus === 'function') ostatniaZakladka.focus();
}
function zamknijWszystkieModale(){
  document.querySelectorAll('.sal-modal-overlay.is-open').forEach(zamknijModal);
}
function nakladkaOtwarta(){
  return document.querySelector('.sal-modal-overlay.is-open') ? true : false;
}
(function wepnijPasek(){
  const burger = $('salBurger'), menu = $('salMobileMenu');
  if(burger && menu){
    burger.addEventListener('click', ()=>{
      const otwarte = menu.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', otwarte ? 'true' : 'false');
    });
  }
  document.querySelectorAll('[data-tab]').forEach(el=>{
    el.addEventListener('click', e=>{
      const id = el.getAttribute('data-modal');
      if(id){ e.preventDefault(); setHelpTab('basic'); otworzModal($(id), el); }
      // Pozycja bez wlasnego okna dziala jak przycisk apki. W menu mobilnym to tylko
      // powtorzenie zakladki z paska, wiec przekazuje klikniecie oryginalowi.
      const proxy = el.getAttribute('data-proxy');
      if(proxy && $(proxy)) $(proxy).click();
      if(menu) menu.classList.remove('is-open');
      if(burger) burger.setAttribute('aria-expanded','false');
    });
  });
  document.querySelectorAll('.sal-modal-overlay').forEach(ov=>{
    ov.addEventListener('click', e=>{ if(e.target===ov) zamknijModal(ov); });
    ov.querySelectorAll('[data-close-modal]').forEach(b=>b.addEventListener('click', ()=>zamknijModal(ov)));
  });
  document.addEventListener('keydown', e=>{
    if(e.key==='Escape' && nakladkaOtwarta()){ zamknijWszystkieModale(); e.preventDefault(); }
  });
})();

// KEYBOARD
// Skroty klawiszowe milkna, gdy uzytkownik pisze. Wczesniej sprawdzany byl tylko
// tagName==='INPUT', wiec spacja w polu OPISU SCENY (textarea) zatrzymywala odtwarzanie
// zamiast wpisac odstep. Liczy sie kazde pole edytowalne, lacznie z contenteditable.
function pisze(t){
  if(!t) return false;
  const tag=t.tagName;
  return tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||t.isContentEditable;
}
// Nakladka na wierzchu przejmuje klawiature: bez tego Spacja czytana w tle uruchamiala
// dzwiek pod otwarta pomoca, a WASD chodzilo po niewidocznej scenie.
// nakladkaOtwarta() jest zadeklarowana raz, przy obsludze paska — druga deklaracja tej
// samej nazwy wygralaby po cichu przez hoisting.
document.addEventListener('keydown', e=>{ if(nakladkaOtwarta()) return; if(pisze(e.target)) return; S.keys[e.code]=true; if(e.code==='Space'){ e.preventDefault(); if(S.selectedSource){ S.selectedSource.playing?stopSource(S.selectedSource):playSource(S.selectedSource); } } });
document.addEventListener('keyup', e=>{ S.keys[e.code]=false; });

// MOUSE / TOUCH
function gcp(e){ const r=mainCanvas.getBoundingClientRect(); return {x:e.clientX-r.left, y:e.clientY-r.top, rect:r}; }
function s2w(sx,sy,r){ const sz=Math.min(r.width,r.height), sc=sz/(S.worldSize*2), cx=r.width/2, cy=r.height/2; if(S.mode==='explore'){ const rad=S.listener.angle*Math.PI/180, dx=(sx-cx)/sc, dy=(sy-cy)/sc; return {x:S.listener.x+dx*Math.cos(rad)-dy*Math.sin(rad), y:S.listener.y+dx*Math.sin(rad)+dy*Math.cos(rad)}; } return {x:(sx-cx)/sc, y:(sy-cy)/sc}; }
function w2s(wx,wy){ const r=mainCanvas.getBoundingClientRect(), sz=Math.min(r.width,r.height), sc=sz/(S.worldSize*2), cx=r.width/2, cy=r.height/2; if(S.mode==='explore'){ const rad=S.listener.angle*Math.PI/180, dx=wx-S.listener.x, dy=wy-S.listener.y; return {x:cx+(dx*Math.cos(rad)+dy*Math.sin(rad))*sc, y:cy+(-dx*Math.sin(rad)+dy*Math.cos(rad))*sc}; } return {x:cx+wx*sc, y:cy+wy*sc}; }
function findAt(wx,wy,th=1.5){ for(const s of S.sources) if(Math.hypot(s.x-wx,s.y-wy)<th) return s; return null; }

let dragSrc=null, pDown=false, pMoved=false, pStart={x:0,y:0};
mainCanvas.addEventListener('mousedown', e=>ptrDown(e.clientX,e.clientY,e.shiftKey));
mainCanvas.addEventListener('mousemove', e=>ptrMove(e.clientX,e.clientY));
mainCanvas.addEventListener('mouseup', e=>ptrUp(e.clientX,e.clientY));
mainCanvas.addEventListener('mouseleave', ()=>{ pDown=false; dragSrc=null; });
mainCanvas.addEventListener('touchstart', e=>{ e.preventDefault(); ptrDown(e.touches[0].clientX,e.touches[0].clientY,false); },{passive:false});
mainCanvas.addEventListener('touchmove', e=>{ e.preventDefault(); ptrMove(e.touches[0].clientX,e.touches[0].clientY); },{passive:false});
mainCanvas.addEventListener('touchend', e=>{ ptrUp(pStart.x,pStart.y); },{passive:false});

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
(function(){ const chk=$('kpoDateManual'), inp=$('kpoDate'), lbl=$('kpoDateAuto');
  function syncDateUI(){ const manual=chk.checked; inp.disabled=!manual; if(manual){if(!inp.value)inp.value=new Date().toISOString().slice(0,10);lbl.textContent='';} else{const d=S.sceneCreatedAt||new Date();lbl.textContent=d.toLocaleDateString('pl-PL');inp.value='';} }
  chk.addEventListener('change', syncDateUI); syncDateUI();
  window._getDate=function(){ if($('kpoDateManual').checked&&$('kpoDate').value) return new Date($('kpoDate').value).toLocaleDateString('pl-PL'); return (S.sceneCreatedAt||new Date()).toLocaleDateString('pl-PL'); };
  window._getDateFull=function(){ if($('kpoDateManual').checked&&$('kpoDate').value) return new Date($('kpoDate').value).toLocaleDateString('pl-PL'); return (S.sceneCreatedAt||new Date()).toLocaleString('pl-PL'); };
})();

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

// WAV ENCODING
function bufToWav(audioBuffer, nCh){
  const sr=audioBuffer.sampleRate, len=audioBuffer.length;
  const ch=Math.min(nCh, audioBuffer.numberOfChannels);
  const buf=new ArrayBuffer(44+len*ch*2), v=new DataView(buf);
  function ws(o,s){for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));}
  ws(0,'RIFF');v.setUint32(4,36+len*ch*2,true);ws(8,'WAVE');ws(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,ch,true);v.setUint32(24,sr,true);v.setUint32(28,sr*ch*2,true);v.setUint16(32,ch*2,true);v.setUint16(34,16,true);ws(36,'data');v.setUint32(40,len*ch*2,true);
  const chData=[]; for(let c2=0;c2<ch;c2++) chData.push(audioBuffer.getChannelData(c2));
  let off=44;
  for(let i=0;i<len;i++) for(let c2=0;c2<ch;c2++){ const s=Math.max(-1,Math.min(1,chData[c2][i])); v.setInt16(off, s<0?s*0x8000:s*0x7FFF, true); off+=2; }
  return new Blob([buf],{type:'audio/wav'});
}

// WAV 32-bit float (IEEE), dowolna liczba kanalow. Uzywany dla AmbiX: pole ambisoniczne
// nie ma naturalnego sufitu 0 dBFS jak miks stereo, a obciecie POJEDYNCZEGO kanalu
// przesuwa zakodowany kierunek. Float nie obcina, wiec kierunek zostaje nietkniety.
// Naglowek zgodny ze specyfikacja dla formatu 3: fmt o dlugosci 18 (cbSize=0) + chunk fact.
function floatArraysToWav32(arrays, sr){
  const nCh=arrays.length, len=arrays[0].length, bytes=len*nCh*4, HDR=58;
  const buf=new ArrayBuffer(HDR+bytes), v=new DataView(buf);
  function ws(o,s){for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));}
  ws(0,'RIFF'); v.setUint32(4,HDR-8+bytes,true); ws(8,'WAVE');
  ws(12,'fmt '); v.setUint32(16,18,true);
  v.setUint16(20,3,true);                 // WAVE_FORMAT_IEEE_FLOAT
  v.setUint16(22,nCh,true); v.setUint32(24,sr,true);
  v.setUint32(28,sr*nCh*4,true);          // byte rate
  v.setUint16(32,nCh*4,true);             // block align
  v.setUint16(34,32,true);                // bits per sample
  v.setUint16(36,0,true);                 // cbSize
  ws(38,'fact'); v.setUint32(42,4,true); v.setUint32(46,len,true);
  ws(50,'data'); v.setUint32(54,bytes,true);
  let off=HDR;
  for(let i=0;i<len;i++) for(let c=0;c<nCh;c++){ v.setFloat32(off,arrays[c][i],true); off+=4; }
  return new Blob([buf],{type:'audio/wav'});
}

// --- OBWIEDNIA GLOSNOSCI ZRODLA (do pliku _SCENA.json) ---------------------------------
// Po co: odtwarzacz ambi ma pulsowac punktem obiektu w rytm TEGO nagrania, a nie wspolnego
// miksu. Liczone wprost z bufora zrodla (getChannelData), przed zmiksowaniem — wiec nie
// wymaga eksportu osobnych stemow. Jeden przebieg po juz wczytanym buforze.
//
// Os czasu jest osia EKSPORTU, nie osia oryginalu: zrodla graja w petli (n.loop=true), wiec
// petla jest tu juz zawinieta. Odtwarzacz indeksuje tablice wprost czasem odtwarzania i nie
// musi wiedziec, jak dlugi byl plik zrodlowy.
//
// Skala: RMS okna -> dBFS -> 0..255 liniowo w decybelach od LEVEL_FLOOR_DB do 0 dBFS.
// Kwantyzacja liniowa w amplitudzie zgubilaby wszystko ponizej -40 dB w kilku krokach.
const LEVEL_HZ = 50;              // 50 Hz = okno 20 ms
const LEVEL_FLOOR_DB = -60;
// Siatka SCIEZKI RUCHU w _SCENA.json, odklejona od siatki obwiedni. Obwiednia niesie
// transjenty i 50 Hz naprawde jej potrzebuje; punkt na kuli — nie. Zmierzone: przy
// decymacji do 10 Hz i interpolacji liniowej blad pozycji nie przekracza 13 cm, a klatek
// jest piec razy mniej. Pomiar i warianty: _SAL-docs\kontrakt-scena-sfera.md, sekcja 4.
const PATH_HZ = 10;
function levelEnvelope(buffer, durationSec){
  const sr=buffer.sampleRate, nCh=buffer.numberOfChannels, len=buffer.length;
  const chans=[]; for(let c=0;c<nCh;c++) chans.push(buffer.getChannelData(c));
  const win=Math.max(1,Math.round(sr/LEVEL_HZ));
  const frames=Math.max(1,Math.ceil(durationSec*LEVEL_HZ));
  const out=new Array(frames);
  for(let f=0;f<frames;f++){
    const start=Math.round(f*sr/LEVEL_HZ);
    let sum=0;
    for(let i=0;i<win;i++){
      const idx=(start+i)%len;                       // petla zrodla
      let m=0; for(let c=0;c<nCh;c++) m+=chans[c][idx];
      m/=nCh; sum+=m*m;
    }
    const rms=Math.sqrt(sum/win);
    const db=rms>1e-7 ? 20*Math.log10(rms) : LEVEL_FLOOR_DB;
    const t=(db-LEVEL_FLOOR_DB)/(0-LEVEL_FLOOR_DB);
    out[f]=Math.max(0,Math.min(255,Math.round(t*255)));
  }
  return out;
}

// Obwiednia zapisana dziesietnie to kilka tysiecy liczb po 2-4 znaki — przy 120 s wychodzi
// ~21 KB na zrodlo, czyli wiecej niz cala sciezka ruchu. Ta sama tablica w base64 wazy 2,7x
// mniej. To jedyne pole formatu, ktore traci czytelnosc golym okiem, i akurat ono czytelne
// nie bylo: 6000 liczb bez znaczenia dla czlowieka. Odtwarzacz rozpoznaje zapis po polu
// `encoding`. Porcjami po 4096, bo apply() na kilku tysiacach argumentow przepelnia stos.
function levelToB64(vals){
  let bin='';
  for(let i=0;i<vals.length;i+=4096) bin+=String.fromCharCode.apply(null,vals.slice(i,i+4096));
  return btoa(bin);
}

// EXPORT 5 FILES
$('generateExport').addEventListener('click', exportScene);

function exportStep(msg, status='active'){
  const el=document.createElement('div'); el.className='kpo-step '+(status==='done'?'done':status==='error'?'error':''); el.textContent=msg; $('kpoSteps').appendChild(el); return el;
}

async function exportScene(){
  const btn=$('generateExport');
  const numerOn=$('sceneNumberOn').checked;
  const nr=numerOn ? ($('sceneNumber').value||'001').trim() : '';
  const nm=($('sceneName').value||'Scena').trim().replace(/\s+/g,'_');
  const opisSceny=($('sceneDesc').value||'').trim();
  const autorSceny=($('sceneAuthor').value||'').trim();
  const licencjaSceny=($('sceneLicense').value||'').trim();
  const dur=parseFloat($('kpoDuration').value)||30;
  // Czestotliwosc probkowania DZIEDZICZONA z zywego kontekstu, nie zaszyta na 44100.
  // Powod: `generateIR()` buduje odpowiedz impulsowa pogloso w `audioCtx.sampleRate`, wiec na
  // karcie 48 kHz `ConvolverNode` odmawial jej przyjecia ("buffer sample rate 48000 does not
  // match the context rate 44100") i PRZERYWAL caly eksport. Przy okazji: bufory zrodel tez
  // sa dekodowane w tej czestotliwosci, wiec teraz nic nie jest po drodze przepróbkowywane.
  const sr=audioCtx.sampleRate, prefix=numerOn ? `SAL_SCENA_${nr}_${nm}` : `SAL_SCENA_${nm}`;
  const includeReverb=$('exportReverb').checked;
  const utrwalRuch=$('exportMotion').checked;
  const stepsEl=$('kpoSteps');
  btn.disabled=true; btn.textContent='⏳ Generowanie…'; stepsEl.innerHTML='';

  const srcs=S.sources.filter(s=>S.buffers[s.id]);
  if(!srcs.length){ exportStep('⚠ Brak źródeł z buforem audio','error'); btn.disabled=false; btn.textContent='⬇ Eksportuj scenę (5 plików)'; return; }

  // Zrodla w trybie strumienia (biblioteka wpada w niego, gdy CORS zablokuje pobranie —
  // na liscie maja plakietke "stream") nie maja bufora w pamieci, wiec renderer offline
  // nie ma czego zagrac. Do sierpnia 2026 znikaly z eksportu BEZ SLOWA i scena na pliku
  // rozjezdzala sie z tym, co bylo slychac w aplikacji. Teraz trzeba to swiadomie potwierdzic.
  const pominiete=S.sources.filter(s=>!S.buffers[s.id]);
  if(pominiete.length){
    btn.disabled=false; btn.textContent='⬇ Eksportuj scenę (5 plików)';
    const ok=await askConfirm({
      title:'Część sceny nie trafi do plików',
      text:pominiete.length===1
        ? 'Jeden dźwięk gra ze strumienia i nie da się go zapisać. Nagranie będzie brzmiało inaczej niż scena, której słuchasz.'
        : pominiete.length+' dźwięków gra ze strumienia i nie da się ich zapisać. Nagranie będzie brzmiało inaczej niż scena, której słuchasz.',
      sub:'Pominięte: '+pominiete.map(s=>s.name).join(', ')+
          '. Żeby je zapisać, wczytaj te dźwięki z dysku zamiast z biblioteki.',
      yes:'Eksportuj mimo to', no:'Anuluj'
    });
    if(!ok){ showToast('Eksport anulowany'); return; }
    btn.disabled=true; btn.textContent='⏳ Generowanie…'; stepsEl.innerHTML='';
    exportStep('⚠ Pominięto '+pominiete.length+' źródeł w trybie stream: '+pominiete.map(s=>s.name).join(', '),'error');
  }

  // TRAJEKTORIE — liczone RAZ, przed obydwoma renderami. Ten sam obiekt `trajektorie`
  // karmi tor binauralny, tor FOA i opis w _SCENA.json, wiec te trzy nie moga pokazac
  // trzech roznych ruchow. Zrodla statyczne (i "Bezposrednio", ktore nie ma pozycji)
  // nie dostaja automatyzacji — plik dla sceny bez ruchu wychodzi identyczny jak dotad.
  // Siatka klatek jest ta sama, co siatka obwiedni glosnosci (LEVEL_HZ), zeby odtwarzacz
  // mogl indeksowac obie tablice tym samym numerem klatki.
  const trajektorie={};
  let nRuchome=0;
  if(utrwalRuch){
    for(const s of srcs){
      if(s.routing==='direct'||!maRuch(s)) continue;
      trajektorie[s.id]=simulateTrajectory(s,dur,LEVEL_HZ);
      nRuchome++;
    }
  }
  // Sluchacz zostaje nieruchomy: jego pozycja to uklad odniesienia pliku, a chodzenie po
  // scenie jest wejsciem od uzytkownika w czasie rzeczywistym, wiec nie da sie go odtworzyc
  // offline bez wczesniejszego nagrania spaceru. To osobny temat.

  try {
    // 1. BINAURAL WAV
    const s1=exportStep('1/5 Binaural WAV — renderowanie HRTF…'+(nRuchome?` (ruch: ${nRuchome})`:''));
    let binauralBlob;
    try {
      const len=sr*dur;
      const off=new OfflineAudioContext(2,len,sr);
      const ol=off.listener, rad=S.listener.angle*Math.PI/180;
      if(ol.positionX){ol.positionX.setValueAtTime(S.listener.x,0);ol.positionY.setValueAtTime(0,0);ol.positionZ.setValueAtTime(S.listener.y,0);ol.forwardX.setValueAtTime(Math.sin(rad),0);ol.forwardY.setValueAtTime(0,0);ol.forwardZ.setValueAtTime(-Math.cos(rad),0);ol.upX.setValueAtTime(0,0);ol.upY.setValueAtTime(1,0);ol.upZ.setValueAtTime(0,0);}

      // Offline master + optional reverb
      const offMaster=off.createGain(); offMaster.gain.value=reverbState.masterVol; offMaster.connect(off.destination);
      let offReverbOut=null;
      if(includeReverb && reverbState.enabled){
        const offRevIn=off.createGain();
        const offRevPre=off.createBiquadFilter(); offRevPre.type='highpass'; offRevPre.frequency.value=250; offRevPre.Q.value=0.7;
        const offConv=off.createConvolver(); offConv.normalize=true; offConv.buffer=generateIR(reverbState.roomSize,reverbState.damping);
        offReverbOut=off.createGain(); offReverbOut.gain.value=reverbState.wet;
        offRevIn.connect(offRevPre); offRevPre.connect(offConv); offConv.connect(offReverbOut); offReverbOut.connect(offMaster);
        var offRevInput=offRevIn;
      }

      for(const s of srcs){
        if(s.routing==='direct'){
          // Direct: bypass HRTF, go straight to master
          const g=off.createGain(); g.gain.value=s.volume;
          const n=off.createBufferSource(); n.buffer=S.buffers[s.id]; n.loop=true; n.connect(g); g.connect(offMaster); n.start(0); n.stop(dur);
        } else {
          // Spatial: air filter + dual panners
          // `tr` jest ustawione tylko dla zrodel, ktore faktycznie sie ruszaja. Gdy go nie ma,
          // wszystko idzie po staremu jednym setValueAtTime na czasie 0 — scena bez ruchu
          // wychodzi z tego kodu bit w bit tak samo jak przed dolozeniem automatyzacji.
          const tr=trajektorie[s.id]||null;
          const h=s.height||0;
          const dyst=(x,y)=>Math.sqrt((x-S.listener.x)**2+(y-S.listener.y)**2+h*h);
          const cutoffZ=d=>Math.max(400,20000*Math.exp(-d*0.06));
          const sendZ=d=>Math.min(0.7,0.05+0.65*(1-1/(1+d*0.12)));
          const dist3d=dyst(s.x,s.y);
          const g=off.createGain(); g.gain.value=s.volume; g.channelCount=2; g.channelCountMode='explicit'; g.channelInterpretation='speakers';
          const airF=off.createBiquadFilter(); airF.type='lowpass'; airF.Q.value=0.5;
          if(tr) rampParam(airF.frequency, i=>cutoffZ(dyst(tr.xs[i],tr.ys[i])), tr);
          else airF.frequency.value=cutoffZ(dist3d);
          const splitter=off.createChannelSplitter(2);
          const pL=off.createPanner(); pL.panningModel='HRTF'; pL.distanceModel='inverse'; pL.refDistance=1; pL.maxDistance=50; pL.rolloffFactor=1;
          const pR=off.createPanner(); pR.panningModel='HRTF'; pR.distanceModel='inverse'; pR.refDistance=1; pR.maxDistance=50; pR.rolloffFactor=1;
          const halfW=s.width/2, srad=(s.spreadAngle||0)*Math.PI/180;
          const ddx=halfW*Math.cos(srad), ddy=halfW*Math.sin(srad);
          // Odsuniecie ddx/ddy (szerokosc zrodla) jedzie razem ze srodkiem, wiec zrodlo
          // stereo obraca sie po scenie jako calosc, a nie rozciaga miedzy stara a nowa pozycja.
          if(pL.positionX){
            pL.positionY.setValueAtTime(h,0); pR.positionY.setValueAtTime(h,0);
            if(tr){
              rampParam(pL.positionX, i=>tr.xs[i]-ddx, tr); rampParam(pL.positionZ, i=>tr.ys[i]-ddy, tr);
              rampParam(pR.positionX, i=>tr.xs[i]+ddx, tr); rampParam(pR.positionZ, i=>tr.ys[i]+ddy, tr);
            } else {
              pL.positionX.setValueAtTime(s.x-ddx,0); pL.positionZ.setValueAtTime(s.y-ddy,0);
              pR.positionX.setValueAtTime(s.x+ddx,0); pR.positionZ.setValueAtTime(s.y+ddy,0);
            }
          }
          g.connect(airF); airF.connect(splitter); splitter.connect(pL,0); splitter.connect(pR,1); pL.connect(offMaster); pR.connect(offMaster);
          // Reverb send — takze zalezna od odleglosci, wiec przy ruchu tez musi jechac w czasie.
          if(offRevInput){ const rs=off.createGain(); g.connect(rs); rs.connect(offRevInput);
            if(tr) rampParam(rs.gain, i=>sendZ(dyst(tr.xs[i],tr.ys[i])), tr); else rs.gain.value=sendZ(dist3d); }
          const n=off.createBufferSource(); n.buffer=S.buffers[s.id]; n.loop=true; n.connect(g); n.start(0); n.stop(dur);
        }
      }
      const rendered=await off.startRendering();
      binauralBlob=bufToWav(rendered,2);
      s1.textContent='✓ 1/5 Binaural WAV — OK'; s1.className='kpo-step done';
    } catch(e){ s1.textContent='✗ 1/5 Binaural WAV — błąd: '+e.message; s1.className='kpo-step error'; throw e; }

    // 2. AMBIX 4-CH WAV — ACN/SN3D, renderowany na TYM SAMYM grafie co binaural
    // -------------------------------------------------------------------------------------
    // Do sierpnia 2026 ten krok byl reczna petla po probkach, calkowicie niezalezna od toru
    // binauralnego. Rozjezdzal sie z nim na szesc sposobow naraz: bufory sa dekodowane
    // w audioCtx.sampleRate, a naglowek pisal na sztywno 44100 (plik gral o 1,5 poltonu
    // nizej); normalizacja byla hybryda FuMa/N3D zamiast SN3D (kanaly kierunkowe +7,8 dB);
    // poglos, suwak Master, filtr powietrza i szerokosc zrodla w ogole nie trafialy do pliku.
    // Teraz oba pliki powstaja z tego samego grafu wezlow WebAudio, wiec te wielkosci nie
    // moga sie juz rozjechac — nie ma dwoch implementacji, ktore trzeba porownywac.
    const s2=exportStep('2/5 AmbiX WAV (4ch ACN/SN3D) — renderowanie FOA…');
    let ambixBlob, ambixOpis='';
    // Opis obiektow dla pliku _SCENA.json. Wypelniany W TEJ SAMEJ petli, ktora koduje AmbiX,
    // i z tej samej funkcji kierunkowej — inaczej punkt na kuli w odtwarzaczu moglby pokazac
    // co innego niz slychac (dokladnie ten blad zdarzyl sie juz w ambi, patrz v9).
    const sceneObjects=[];
    let peakOut=0, normOut=1;
    try {
      const len=sr*dur;
      const off=new OfflineAudioContext(4,len,sr);
      const merger=off.createChannelMerger(4);          // ACN: 0=W 1=Y 2=Z 3=X
      const foaMaster=off.createGain(); foaMaster.gain.value=reverbState.masterVol;
      merger.connect(foaMaster); foaMaster.connect(off.destination);

      const listRad=S.listener.angle*Math.PI/180;
      // Kierunek punktu sceny w ukladzie sluchacza. Te same wektory, co listener.forward
      // w torze binauralnym: przod = (sin a, -cos a), prawo = (cos a, sin a).
      function kierunekFOA(px,py,ph){
        const dx=px-S.listener.x, dy=py-S.listener.y, dh=ph||0;
        const fwd=dx*Math.sin(listRad)-dy*Math.cos(listRad);
        const rgt=dx*Math.cos(listRad)+dy*Math.sin(listRad);
        const distH=Math.sqrt(fwd*fwd+rgt*rgt), dist3d=Math.sqrt(distH*distH+dh*dh);
        // Konwencja ambisoniczna: azymut dodatni w LEWO, elewacja dodatnia w GORE.
        // fwd/rgt wychodza na zewnatrz, bo sciezka v3 zapisuje wlasnie je (y do przodu,
        // x w prawo). Liczenie ich drugi raz z az/dist byloby tym samym rachunkiem w dwoch
        // miejscach — a to w tym projekcie skonczylo sie juz raz szescioma usterkami naraz.
        return { az:Math.atan2(-rgt,fwd), el:Math.atan2(dh,distH), dist3d, fwd, rgt };
      }
      // Wzmocnienia AmbiX ACN/SN3D pierwszego rzedu. Dla fali plaskiej WSZYSTKIE rowne 1 —
      // ten sam wzor, co shAcnSn3d() w odtwarzaczu ambi (W=1, Y=y, Z=z, X=x).
      function sn3dFOA(az,el){ const ce=Math.cos(el); return [1, ce*Math.sin(az), Math.sin(el), ce*Math.cos(az)]; }
      // Tlumienie odlegloscia identyczne z modelem 'inverse' PannerNode w torze binauralnym:
      // refDistance=1, rolloffFactor=1, maxDistance=50.
      function distGainFOA(d){ return 1/Math.min(Math.max(d,1),50); }
      // Wpina sygnal mono w enkoder FOA ustawiony na zadany punkt sceny.
      // Gdy podana jest trajektoria `tr`, cztery wzmocnienia enkodera sa RAMPOWANE klatka po
      // klatce wzdluz niej — kierunek i tlumienie odlegloscia zmieniaja sie w czasie zamiast
      // stac na wartosci z chwili klikniecia "Eksportuj". `offX/offY` to stale odsuniecie
      // punktu od srodka zrodla (polowa szerokosci stereo), jedzie razem ze srodkiem.
      // Enkoder ambisoniczny nie ma czego "obrocic" — kierunek SIEDZI w tych czterech
      // wzmocnieniach, wiec ruch w FOA to z definicji ich automatyzacja.
      function encodeFOA(node,px,py,ph,tr,offX,offY){
        const params=[];
        for(let c=0;c<4;c++){ const gn=off.createGain(); node.connect(gn); gn.connect(merger,0,c); params.push(gn.gain); }
        function wartosci(x,y){
          const k=kierunekFOA(x,y,ph), g=sn3dFOA(k.az,k.el), a=distGainFOA(k.dist3d);
          return [g[0]*a,g[1]*a,g[2]*a,g[3]*a];
        }
        if(!tr){ const v=wartosci(px,py); for(let c=0;c<4;c++) params[c].value=v[c]; return; }
        // Kierunek liczony RAZ na klatke i buforowany — inaczej ta sama funkcja
        // trygonometryczna szlaby cztery razy przez kazda klatke kazdego enkodera.
        const dx=offX||0, dy=offY||0, buf=new Float64Array(tr.frames*4);
        for(let i=0;i<tr.frames;i++){ const v=wartosci(tr.xs[i]+dx,tr.ys[i]+dy); buf[i*4]=v[0]; buf[i*4+1]=v[1]; buf[i*4+2]=v[2]; buf[i*4+3]=v[3]; }
        for(let c=0;c<4;c++) rampParam(params[c], i=>buf[i*4+c], tr);
      }
      // Sprowadza dowolny sygnal do jednego kanalu i wysyla go w W (pole bezkierunkowe).
      function doW(node,gain){
        const mono=off.createGain(); mono.channelCount=1; mono.channelCountMode='explicit'; mono.channelInterpretation='speakers';
        mono.gain.value=(gain===undefined?1:gain);
        node.connect(mono); mono.connect(merger,0,0);
      }

      // Poglos — te same wezly co w binauralu. W polu ambisonicznym jest rozproszony,
      // wiec idzie w kanal W (bezkierunkowy), nie w konkretny punkt sceny.
      let foaRevIn=null;
      if(includeReverb && reverbState.enabled){
        const revIn=off.createGain();
        const pre=off.createBiquadFilter(); pre.type='highpass'; pre.frequency.value=250; pre.Q.value=0.7;
        const conv=off.createConvolver(); conv.normalize=true; conv.buffer=generateIR(reverbState.roomSize,reverbState.damping);
        const wet=off.createGain(); wet.gain.value=reverbState.wet;
        revIn.connect(pre); pre.connect(conv); conv.connect(wet);
        // Poglos jest STEREO i jego dwa kanaly sa zdekorelowane — to wlasnie one daja
        // wrazenie wspolnej przestrzeni. Do sierpnia 2026 szly przez doW(), czyli byly
        // sciagane do mono i wrzucane w bezkierunkowe W: w pliku AmbiX poglos tracil cala
        // szerokosc i scena rozpadala sie na osobno grajace dzwieki.
        // Teraz lewy kanal jedzie jako fala plaska z LEWA (az +90), prawy z PRAWA (az -90).
        // Wzmocnienie 0.5 na kanal jest dobrane tak, zeby W dostal doklad nie tyle samo co
        // wczesniej (down-mix stereo->mono to 0.5·(L+R)), a roznica L-R wyladowala w Y.
        // Poziom sie wiec nie zmienia — dochodzi wylacznie szerokosc.
        const wetSplit=off.createChannelSplitter(2);
        wet.channelCount=2; wet.channelCountMode='explicit'; wet.channelInterpretation='speakers';
        wet.connect(wetSplit);
        [[0, Math.PI/2],[1, -Math.PI/2]].forEach(([chIdx,azRad])=>{
          const g=sn3dFOA(azRad,0);
          for(let c=0;c<4;c++){
            const gn=off.createGain(); gn.gain.value=g[c]*0.5;
            wetSplit.connect(gn,chIdx); gn.connect(merger,0,c);
          }
        });
        foaRevIn=revIn;
      }

      let nPrzestrzenne=0, nBezkierunkowe=0;
      for(const s of srcs){
        const n=off.createBufferSource(); n.buffer=S.buffers[s.id]; n.loop=true;
        const objMeta={ name:s.name, routing:s.routing, volume:+(s.volume.toFixed(3)),
                        author:s.attrAuthor||null, license:s.attrLicense||null, sourceUrl:s.attrUrl||null,
                        level:{ hz:LEVEL_HZ, encoding:'uint8-db-b64', dbFloor:LEVEL_FLOOR_DB,
                                values:levelToB64(levelEnvelope(S.buffers[s.id],dur)) } };
        sceneObjects.push(objMeta);
        if(s.routing==='direct'){
          // Zrodla "Bezposrednio" nie maja pozycji na scenie. W FOA sa polem bezkierunkowym
          // (sam kanal W) — slychac je wszedzie tak samo, dokladnie jak w aplikacji.
          // Wczesniej byly z pliku AmbiX po cichu wyrzucane.
          const g=off.createGain(); g.gain.value=s.volume;
          n.connect(g); doW(g);
          nBezkierunkowe++;
        } else {
          // Ta sama trajektoria, co w torze binauralnym — jeden obiekt `trajektorie`
          // dla obu renderow, wiec pliki nie moga pokazac dwoch roznych ruchow.
          const tr=trajektorie[s.id]||null;
          const h=s.height||0;
          const dyst=(x,y)=>Math.sqrt((x-S.listener.x)**2+(y-S.listener.y)**2+h*h);
          const cutoffZ=d=>Math.max(400,20000*Math.exp(-d*0.06));
          const sendZ=d=>Math.min(0.7,0.05+0.65*(1-1/(1+d*0.12)));
          const dist3d=dyst(s.x,s.y);
          const g=off.createGain(); g.gain.value=s.volume; g.channelCount=2; g.channelCountMode='explicit'; g.channelInterpretation='speakers';
          const airF=off.createBiquadFilter(); airF.type='lowpass'; airF.Q.value=0.5;
          if(tr) rampParam(airF.frequency, i=>cutoffZ(dyst(tr.xs[i],tr.ys[i])), tr);
          else airF.frequency.value=cutoffZ(dist3d);
          const splitter=off.createChannelSplitter(2);
          n.connect(g); g.connect(airF); airF.connect(splitter);
          // Szerokosc zrodla: te same dwa punkty, co pannerL/pannerR w torze binauralnym.
          const halfW=s.width/2, srad=(s.spreadAngle||0)*Math.PI/180;
          const ddx=halfW*Math.cos(srad), ddy=halfW*Math.sin(srad);
          // Kierunek SRODKA zrodla (nie punktow L/R szerokosci) — to on trafia na kule.
          const kMid=kierunekFOA(s.x,s.y,h);
          objMeta.az=+(kMid.az*180/Math.PI).toFixed(2);
          objMeta.el=+(kMid.el*180/Math.PI).toFixed(2);
          objMeta.dist=+kMid.dist3d.toFixed(2);
          // Sciezka czasowa dla Sfery, format v3: KARTEZJANSKA i rzadsza od obwiedni.
          // Pola az/el/dist wyzej zostaja jako wartosc PIERWSZEJ klatki, wiec odtwarzacz,
          // ktory o `path` nie wie, dziala jak dotad — punkt stanie w miejscu, ale we
          // wlasciwym. To jest caly mechanizm zgodnosci wstecz i nie wolno go ruszac.
          //
          // Dlaczego x/y zamiast az/el/dist: dwie tablice zamiast trzech, wysokosc schodzi
          // do jednej liczby (Scena nie animuje height), a przy interpolacji nie ma czego
          // zawijac na przejsciu przez +/-180 stopni. Azymut i odleglosc odtwarzacz wylicza
          // jednym atan2 i jednym hypot.
          if(tr){
            // DECYMACJA trajektorii 50 Hz, nie druga symulacja w 10 Hz. stepMotion() zalezy
            // od dt (martwa strefa, przyciaganie do waypointa, timer losowania), wiec
            // symulacja w innej czestotliwosci daje INNA droge, a nie te sama rzadziej
            // probkowana. Pomiar tego bledu raz juz pokazal "150 stopni" i byl bez sensu.
            const krok=Math.max(1,Math.round(LEVEL_HZ/PATH_HZ));
            // +1 klatka, zeby ostatnia probka siegala konca pliku, a nie konczyla sie
            // 0,1 s wczesniej — inaczej punkt zamarza tuz przed koncem sceny.
            const kl=Math.max(2,Math.ceil(dur*PATH_HZ)+1);
            const xs=new Array(kl), ys=new Array(kl);
            for(let i=0;i<kl;i++){
              const j=Math.min(i*krok,tr.frames-1), k=kierunekFOA(tr.xs[j],tr.ys[j],h);
              xs[i]=+k.rgt.toFixed(2); ys[i]=+k.fwd.toFixed(2);
            }
            objMeta.motion={ mode:s.motion.mode, speed:+s.motion.speed.toFixed(2), seed:s.motion.seed>>>0 };
            // `frame` nazywa uklad, w ktorym sa te liczby. Az/el tez byly w ukladzie
            // sluchacza, tylko nikt tego nie zapisal — za pol roku nikt nie bylby pewien.
            objMeta.path={ hz:PATH_HZ, frame:'listener', x:xs, y:ys, h:+(h||0).toFixed(2) };
          }
          const encL=off.createGain(), encR=off.createGain();
          splitter.connect(encL,0); splitter.connect(encR,1);
          encodeFOA(encL, s.x-ddx, s.y-ddy, h, tr, -ddx, -ddy);
          encodeFOA(encR, s.x+ddx, s.y+ddy, h, tr, +ddx, +ddy);
          if(foaRevIn){ const rs=off.createGain(); g.connect(rs); rs.connect(foaRevIn);
            if(tr) rampParam(rs.gain, i=>sendZ(dyst(tr.xs[i],tr.ys[i])), tr); else rs.gain.value=sendZ(dist3d); }
          nPrzestrzenne++;
        }
        n.start(0); n.stop(dur);
      }

      const rendered=await off.startRendering();
      const chans=[]; let peak=0;
      for(let c=0;c<4;c++){ const d=rendered.getChannelData(c); chans.push(d); for(let i=0;i<d.length;i++){ const a=Math.abs(d[i]); if(a>peak) peak=a; } }
      // Jesli scena przekracza 0 dBFS, wyrownanie idzie JEDNYM wspolnym wspolczynnikiem na
      // wszystkie cztery kanaly. Osobne skalowanie (albo obciecie samego X/Y/Z) przesunelo
      // by zakodowany kierunek — to wlasnie robil poprzedni zapis 16-bitowy.
      let norm=1;
      if(peak>1){ norm=0.999/peak; for(const d of chans) for(let i=0;i<d.length;i++) d[i]*=norm; }
      peakOut=peak; normOut=norm;
      ambixBlob=floatArraysToWav32(chans,sr);
      ambixOpis=`szczyt ${(20*Math.log10(Math.max(peak,1e-9))).toFixed(1)} dBFS`+(norm<1?`, wyrownanie -${(-20*Math.log10(norm)).toFixed(1)} dB wspolne dla 4 kanalow`:'');
      s2.textContent=`✓ 2/5 AmbiX WAV (4ch ACN/SN3D, 32-bit float) — OK · ${nPrzestrzenne} przestrzennych, ${nBezkierunkowe} bezkierunkowych`+(nRuchome?`, ${nRuchome} w ruchu (${LEVEL_HZ} kl./s)`:', bez ruchu')+` · ${ambixOpis}`;
      s2.className='kpo-step done';
    } catch(e){ s2.textContent='✗ 2/5 AmbiX WAV — błąd: '+e.message; s2.className='kpo-step error'; throw e; }

    // 3. MAP JPG
    const s3=exportStep('3/5 Mapa JPG — zrzut płótna…');
    let mapBlob;
    try {
      const snap=document.createElement('canvas'); snap.width=1200; snap.height=900;
      const sc2=snap.getContext('2d'), sc=Math.min(snap.width,snap.height)/(S.worldSize*2), cxM=snap.width/2, cyM=snap.height/2;
      sc2.fillStyle='#0A0C08'; sc2.fillRect(0,0,snap.width,snap.height);
      sc2.fillStyle='#9C9890'; sc2.font="bold 14px 'Azeret Mono',monospace"; sc2.fillText(numerOn?`SAL SCENA ${nr} — ${nm.replace(/_/g,' ')}`:`SAL — ${nm.replace(/_/g,' ')}`,20,28);
      sc2.fillStyle='#9C9890'; sc2.font="11px 'Azeret Mono',monospace";
      // Data na obrazku jest opcjonalna — komplet danych i tak siedzi w META i w JSON.
      sc2.fillText(`Czas: ${dur}s · Źródeł: ${srcs.length}`+($('mapDateOn').checked?` · ${window._getDate()}`:''),20,48);
      sc2.save(); sc2.translate(cxM,cyM);
      sc2.strokeStyle='rgba(0,229,204,0.06)';sc2.lineWidth=1;
      for(let i=-S.worldSize;i<=S.worldSize;i+=5){sc2.beginPath();sc2.moveTo(i*sc,-S.worldSize*sc);sc2.lineTo(i*sc,S.worldSize*sc);sc2.stroke();sc2.beginPath();sc2.moveTo(-S.worldSize*sc,i*sc);sc2.lineTo(S.worldSize*sc,i*sc);sc2.stroke();}
      sc2.strokeStyle='rgba(0,229,204,0.2)'; sc2.strokeRect(-S.worldSize*sc,-S.worldSize*sc,S.worldSize*2*sc,S.worldSize*2*sc);
      sc2.strokeStyle='rgba(0,229,204,0.15)';sc2.lineWidth=1;sc2.setLineDash([4,4]);sc2.beginPath();sc2.moveTo(-S.worldSize*sc,0);sc2.lineTo(S.worldSize*sc,0);sc2.stroke();sc2.beginPath();sc2.moveTo(0,-S.worldSize*sc);sc2.lineTo(0,S.worldSize*sc);sc2.stroke();sc2.setLineDash([]);
      S.sources.forEach((src,idx)=>{
        const sxM=src.x*sc,syM=src.y*sc, isDirect=src.routing==='direct';
        const dist=Math.sqrt((src.x-S.listener.x)**2+(src.y-S.listener.y)**2+(src.height||0)**2);
        const cHex=isDirect?'#FFAB00':'#00E5CC';
        sc2.strokeStyle='rgba(0,229,204,0.2)';sc2.lineWidth=0.8;sc2.setLineDash([4,4]);sc2.beginPath();sc2.moveTo(S.listener.x*sc,S.listener.y*sc);sc2.lineTo(sxM,syM);sc2.stroke();sc2.setLineDash([]);
        const grd=sc2.createRadialGradient(sxM,syM,0,sxM,syM,28);grd.addColorStop(0,'rgba(0,229,204,0.18)');grd.addColorStop(1,'rgba(0,229,204,0)');sc2.fillStyle=grd;sc2.beginPath();sc2.arc(sxM,syM,28,0,Math.PI*2);sc2.fill();
        // Stereo width line on map
        if(src.width>0.05&&!isDirect){const hw=src.width/2,sr2=(src.spreadAngle||0)*Math.PI/180,ddx=hw*Math.cos(sr2)*sc,ddy=hw*Math.sin(sr2)*sc;sc2.strokeStyle='rgba(0,229,204,0.5)';sc2.lineWidth=2;sc2.beginPath();sc2.moveTo(sxM-ddx,syM-ddy);sc2.lineTo(sxM+ddx,syM+ddy);sc2.stroke();}
        sc2.strokeStyle=cHex;sc2.lineWidth=1.5;
        if(isDirect){sc2.beginPath();sc2.moveTo(sxM,syM-10);sc2.lineTo(sxM+10,syM);sc2.lineTo(sxM,syM+10);sc2.lineTo(sxM-10,syM);sc2.closePath();sc2.stroke();sc2.fillStyle='rgba(255,171,0,0.12)';sc2.fill();}
        else{sc2.beginPath();sc2.arc(sxM,syM,10,0,Math.PI*2);sc2.stroke();sc2.fillStyle='rgba(0,229,204,0.12)';sc2.beginPath();sc2.arc(sxM,syM,10,0,Math.PI*2);sc2.fill();}
        sc2.fillStyle=cHex;sc2.font="bold 10px 'Azeret Mono',monospace";sc2.textAlign='center';sc2.textBaseline='middle';sc2.fillText(String(idx+1).padStart(2,'0'),sxM,syM);
        sc2.fillStyle='#9C9890';sc2.font="9px 'Azeret Mono',monospace";sc2.textAlign='center';sc2.textBaseline='top';
        let lbl=src.name.length>20?src.name.slice(0,17)+'…':src.name; sc2.fillText(lbl,sxM,syM+14);
        sc2.fillStyle='#9C9890';sc2.font="8px 'Azeret Mono',monospace";
        let meta=`${dist.toFixed(1)}m · ${Math.round(src.volume*100)}%`;
        if(isDirect) meta+=' · DIRECT';
        if(Math.abs(src.height||0)>0.2) meta+=' · '+(src.height>0?'↑':'↓')+Math.abs(src.height).toFixed(1)+'m';
        sc2.fillText(meta,sxM,syM+25);
      });
      const lxM=S.listener.x*sc,lyM=S.listener.y*sc,lrM=S.listener.angle*Math.PI/180;
      sc2.strokeStyle='#FFAB00';sc2.lineWidth=2;sc2.beginPath();sc2.arc(lxM,lyM,12,0,Math.PI*2);sc2.stroke();sc2.fillStyle='#FFAB00';sc2.beginPath();sc2.arc(lxM,lyM,4,0,Math.PI*2);sc2.fill();
      sc2.strokeStyle='#FFAB00';sc2.lineWidth=2;sc2.beginPath();sc2.moveTo(lxM,lyM);sc2.lineTo(lxM+Math.sin(lrM)*25,lyM-Math.cos(lrM)*25);sc2.stroke();
      sc2.restore();
      mapBlob=await new Promise(r=>snap.toBlob(r,'image/jpeg',0.92));
      s3.textContent='✓ 3/5 Mapa JPG — OK'; s3.className='kpo-step done';
    } catch(e){ s3.textContent='✗ 3/5 Mapa JPG — błąd: '+e.message; s3.className='kpo-step error'; throw e; }

    // 4. METADATA TXT
    const s4=exportStep('4/5 Metadane TXT…');
    let metaBlob;
    try {
      let txt=`SAL — Spatial Audio Lab\n${'═'.repeat(40)}\nScena: ${numerOn?nr+' — ':''}${nm.replace(/_/g,' ')}\n${autorSceny?'Autor sceny: '+autorSceny+'\n':''}${licencjaSceny?'Licencja sceny: '+licencjaSceny+'\n':''}${opisSceny?'\nOpis:\n'+opisSceny+'\n':''}\nData: ${window._getDateFull()}\nCzas trwania: ${dur}s\nSample rate: ${sr} Hz\nReverb: ${includeReverb&&reverbState.enabled?'Tak (rozmiar:'+reverbState.roomSize.toFixed(2)+', tłumienie:'+reverbState.damping.toFixed(2)+', wet:'+Math.round(reverbState.wet*100)+'%)':'Nie'}\n\nListener: x=${S.listener.x.toFixed(2)}, y=${S.listener.y.toFixed(2)}, angle=${Math.round(S.listener.angle)}°\n\nŹródła (${srcs.length}):\n${'─'.repeat(40)}\n`;
      srcs.forEach((src,i)=>{
        const dist=Math.sqrt((src.x-S.listener.x)**2+(src.y-S.listener.y)**2+(src.height||0)**2);
        txt+=`\n${String(i+1).padStart(2,'0')}. ${src.name}\n    Routing: ${src.routing}\n    Pozycja: x=${src.x.toFixed(2)}, y=${src.y.toFixed(2)}${(src.height||0)>0.1?', h='+src.height.toFixed(2)+'m':''}\n    Dystans: ${dist.toFixed(2)}m\n    Głośność: ${Math.round(src.volume*100)}%\n`;
        if(src.routing==='spatial'){
          const cutoff=Math.max(400,20000*Math.exp(-dist*0.06));
          txt+=`    Absorpcja: ${Math.round(cutoff)} Hz\n`;
          if(src.width>0.05) txt+=`    Szerokość stereo: ${src.width.toFixed(1)}m @ ${Math.round(src.spreadAngle)}°\n`;
        }
        if(src.motion.mode!=='static'){
          const utrwalony=!!trajektorie[src.id];
          txt+=`    Ruch: ${src.motion.mode} (prędkość: ${src.motion.speed.toFixed(1)} m/s) — ${utrwalony?'utrwalony w plikach, '+LEVEL_HZ+' kl./s':'NIE utrwalony (pozycja zamrożona)'}\n`;
          if(utrwalony&&src.motion.mode==='random') txt+=`    Ziarno ruchu losowego: ${src.motion.seed>>>0}\n`;
        }
        if(src.attrAuthor) txt+=`    Autor: ${src.attrAuthor}\n`;
        if(src.attrLicense) txt+=`    Licencja: ${src.attrLicense}\n`;
        if(src.attrUrl) txt+=`    Źródło: ${src.attrUrl}\n`;
      });
      txt+=`\n${'═'.repeat(40)}\nPliki:\n  ${prefix}_BINAURAL.wav — stereo HRTF (2ch, 16-bit, ${sr} Hz)\n  ${prefix}_AMBIX.wav — First Order Ambisonics (4ch, 32-bit float, ${sr} Hz)\n      Kolejność ACN: W, Y, Z, X · normalizacja SN3D · azymut dodatni w lewo, elewacja dodatnia w górę\n      Pogłos zakodowany bezkierunkowo (kanał W). Źródła w trybie Bezpośrednio również w kanale W.\n      ${ambixOpis}\n  ${prefix}_MAPA.jpg — wizualizacja sceny\n  ${prefix}_META.txt — ten plik\n  ${prefix}_SCENA.json — ten sam opis maszynowo, dla Sfery\n      (nazwy obiektow, azymut/elewacja w stopniach, obwiednia glosnosci 50 Hz)\n\n`+
      (nRuchome
        ? `RUCH: ${nRuchome} ${nRuchome===1?'źródło jest utrwalone':'źródeł jest utrwalonych'} w obu plikach audio —\ntrajektoria przeliczona co ${(1000/LEVEL_HZ).toFixed(0)} ms i zapisana jako automatyzacja (pozycja, absorpcja powietrza,\nwysyłka pogłosu). Ścieżka czasowa każdego źródła jest też w _SCENA.json (pole "path").\nRuch losowy idzie z zapisanego ziarna, więc powtórny eksport tej samej sceny da ten sam plik.\n\nPozycja SŁUCHACZA pozostaje zamrożona na moment eksportu — jest układem odniesienia pliku,\na chodzenie po scenie jest wejściem w czasie rzeczywistym i nie da się go odtworzyć offline.\n`
        : (utrwalRuch
          ? `RUCH: brak — wszystkie źródła są statyczne, pozycje w plikach są stałe.\n`
          : `UWAGA: opcja "Ruch źródeł w eksporcie" była WYŁĄCZONA — pozycje w obu plikach są\nzamrożone na moment eksportu, mimo że część źródeł ma ustawiony ruch.\n`));
      metaBlob=new Blob([txt],{type:'text/plain;charset=utf-8'});
      s4.textContent='✓ 4/5 Metadane TXT — OK'; s4.className='kpo-step done';
    } catch(e){ s4.textContent='✗ 4/5 Metadane — błąd: '+e.message; s4.className='kpo-step error'; throw e; }

    // 5. SCENA JSON — opis sceny do odczytu maszynowego (Sfera)
    // -------------------------------------------------------------------------------------
    // Osobny plik, nie blok w _META.txt: TXT zostaje czysto ludzki, a parser po stronie
    // odtwarzacza jest zwyklym JSON.parse zamiast wlasnego formatu.
    const s5=exportStep('5/5 Scena JSON — opis dla odtwarzacza…');
    let sceneBlob;
    try {
      const scene={
        format:'sal-scene',
        // Zgodnosc wstecz stoi na jednym: pola az/el/dist obiektu ZOSTAJA i trzymaja
        // wartosc pierwszej klatki. Czytnik, ktory o `path` nie wie, postawi punkt tam,
        // gdzie zawsze — po prostu bez ruchu. Dotyczy to v2 tak samo jak v3.
        //
        // v3 wobec v2 zmienia dwie rzeczy, obie po pomiarze (kontrakt-scena-sfera.md):
        //   - `path` jest kartezjanska (x/y/h) i rzadsza (10 Hz zamiast 50),
        //   - `level.values` to base64 zamiast tablicy dziesietnej (encoding: uint8-db-b64).
        // Zmierzone (harness-sfera.js, scena 60 s, 1 zrodlo, wysokosc 0, orbita — przypadek
        // NAJMNIEJ korzystny dla v3): 35,0 KB -> 10,6 KB. Sciezka 3,7x, obwiednia 3,0x.
        // Przy wiekszej liczbie zrodel i niezerowych wysokosciach zysk jest wiekszy.
        // Odtwarzacz rozpoznaje oba zapisy po ksztalcie pola, wiec pliki v2 dalej sie otwieraja.
        version:3,
        scene:{ number:numerOn?nr:null, name:nm.replace(/_/g,' '), description:opisSceny||null,
                author:autorSceny||null, license:licencjaSceny||null,
                date:window._getDateFull(), duration:dur, sampleRate:sr },
        audioFile:prefix+'_AMBIX.wav',
        // Konwencja kierunku — ta sama, co w naglowku AmbiX: azymut dodatni w LEWO,
        // elewacja dodatnia w GORE, zero = przod sluchacza w chwili eksportu.
        convention:{ order:'ACN', normalization:'SN3D', azimuth:'dodatni w lewo', elevation:'dodatni w gore' },
        // `frozen` mowi o ZRODLACH. false = przynajmniej jedno ma pole `path` ze sciezka
        // czasowa i w plikach audio faktycznie sie rusza. Sluchacz jest zamrozony zawsze —
        // jego pozycja to uklad odniesienia pliku, stad osobne `listenerFrozen`.
        frozen:nRuchome===0,
        listenerFrozen:true,
        // hz opisuje siatke SCIEZKI (obiekt.path). Automatyzacja wzmocnien w plikach audio
        // jedzie gestsza siatka LEVEL_HZ — to jest w _META.txt, bo dotyczy dzwieku, nie opisu.
        motion:{ hz:PATH_HZ, sources:nRuchome, captured:utrwalRuch },
        listener:{ x:+S.listener.x.toFixed(3), y:+S.listener.y.toFixed(3), angle:Math.round(S.listener.angle) },
        peak:+peakOut.toFixed(4),
        gainApplied:+normOut.toFixed(4),
        objects:sceneObjects
      };
      sceneBlob=new Blob([JSON.stringify(scene)],{type:'application/json;charset=utf-8'});
      const kb=Math.max(1,Math.round(sceneBlob.size/1024));
      s5.textContent=`✓ 5/5 Scena JSON — OK · ${sceneObjects.length} obiektów · ${kb} KB`;
      s5.className='kpo-step done';
    } catch(e){ s5.textContent='✗ 5/5 Scena JSON — błąd: '+e.message; s5.className='kpo-step error'; throw e; }

    // DOWNLOAD
    [[binauralBlob,prefix+'_BINAURAL.wav'],[ambixBlob,prefix+'_AMBIX.wav'],[mapBlob,prefix+'_MAPA.jpg'],[metaBlob,prefix+'_META.txt'],[sceneBlob,prefix+'_SCENA.json']].forEach(([blob,name])=>{
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); URL.revokeObjectURL(a.href);
    });
    exportStep('✓ Gotowe! 5 plików pobranych.','done');
  } catch(e){ exportStep('Eksport przerwany: '+e.message,'error'); }
  btn.disabled=false; btn.textContent='⬇ Eksportuj scenę (5 plików)';
}

// INIT
updateListener();
loadLibrary();
requestAnimationFrame(loop);
// --- par.08 v3.1: stan dzwieku niesie DIODA, nie napis --------------------------------
// Do v3.0 pasek pokazywal "Audio Context: Idle/Running". Wzorzec v3.1 tego napisu nie ma:
// dioda pulsuje i rozchodzi sie pierscieniem, gdy dzwiek gra, a przycisk transportu i tak
// mowi to slowami. Trzeci raz ta sama informacja tylko zabierala miejsce nazwie apki.
(function(){
  var bar = document.getElementById('salBar');
  var dot = document.getElementById('salStatusDot');
  if(!bar || !dot) return;
  function refresh(){
    var gra = audioCtx.state === 'running' && S.sources.some(function(z){ return z.playing; });
    dot.classList.toggle('is-playing', gra);
    bar.classList.toggle('is-playing', gra);
  }
  audioCtx.addEventListener('statechange', refresh);
  setInterval(refresh, 300);
  refresh();
})();
// --- SAL Manifest par.12: zamkniecie ostrzezenia o sluchawkach ---
(function(){
  var w = document.getElementById('hpWarn'), b = document.getElementById('hpWarnClose');
  if(w && b) b.addEventListener('click', function(){ w.classList.add('hidden'); });
})();

