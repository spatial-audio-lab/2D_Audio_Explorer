import { $, S, fileInput, fileDrop, sourcesList, selName, selAuthor, selLicense, selUrl, attrState, volSlider, volVal, heightSlider, heightVal, selDist, selAbsorb, widthSlider, widthVal, angleSlider, angleVal, stereoInd, spatialSection, routingToggle, motionModeRow, motionSpeed, motionSpeedVal, orbitRadiusEl, orbitRadiusVal, randomRangeEl, randomRangeVal, pathLoopEl, pathLoopVal, orbitParams, randomParams, pathParams, hudSrc } from './dom-state.js';
import { audioCtx, buildSrc, setRouting, updPanners } from './audio-engine.js';
import { showToast, askConfirm, syncSubStates, syncAttrState, openSourcePropertiesPanel } from './ui.js';
import { updateLibBtns } from './library.js';

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
  // -- ZADANIE 3.2: Zaznacz nowy dźwięk i otwórz panel --
  selectSource(s); 
  openSourcePropertiesPanel(); 
  // ------------------------------------------------------
}
async function createFromStream(url, name, x, y, libId=null, vol=0.7){
  const id='s'+Date.now()+'_'+Math.random().toString(36).slice(2,7);
  const a=new Audio(); a.crossOrigin='anonymous'; a.loop=true; a.preload='auto'; a.src=url;
  await new Promise((ok,fail)=>{a.addEventListener('canplay',ok,{once:true});a.addEventListener('error',()=>fail(new Error('Load error')),{once:true});setTimeout(()=>fail(new Error('Timeout')),15000);});
  const ms=audioCtx.createMediaElementSource(a);
  const s=buildSrc(id, name, x, y, vol, libId); s.isStream=true; s.audioElement=a; s.mediaSource=ms; ms.connect(s.gain);
  S.sources.push(s); renderSources(); return s;
  // -- ZADANIE 3.2: Zaznacz nowy dźwięk i otwórz panel --
  selectSource(s); 
  openSourcePropertiesPanel(); 
  // ------------------------------------------------------
}

// FILES
export function initSources(){
fileDrop.addEventListener('click', ()=>fileInput.click());
  fileDrop.addEventListener('dragover', e=>{ e.preventDefault(); fileDrop.classList.add('dragover'); });
  fileDrop.addEventListener('dragleave', ()=>fileDrop.classList.remove('dragover'));
  fileDrop.addEventListener('drop', e=>{ e.preventDefault(); fileDrop.classList.remove('dragover'); handleFiles(e.dataTransfer.files); });
  fileInput.addEventListener('change', ()=>{ handleFiles(fileInput.files); fileInput.value=''; });
}

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


export { cleanFileName, createFromBuffer, createFromStream, handleFiles, playSource, stopSource, removeSource, selectSource, updateSel, renderSources, updateCounters };
