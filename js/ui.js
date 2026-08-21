import { $, S, selName, selAuthor, selLicense, selUrl, attrState, volSlider, volVal, heightSlider, heightVal, widthSlider, widthVal, angleSlider, angleVal, stereoInd, spatialSection, routingToggle, motionModeRow, motionSpeed, motionSpeedVal, orbitRadiusEl, orbitRadiusVal, randomRangeEl, randomRangeVal, pathLoopEl, pathLoopVal, orbitParams, randomParams, pathParams, toastEl, libPanel } from './dom-state.js';
import { audioCtx, masterGain, reverbOutput, reverbState, updateReverb, updateReverbSend, setRouting, updPanners } from './audio-engine.js';
import { playSource, stopSource, renderSources, updateCounters } from './sources.js';

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

export function initUIBase(){
  document.querySelectorAll('.acc-head').forEach(h => {
    h.addEventListener('click', () => toggleAccHead(h));
    h.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' '){ e.preventDefault(); toggleAccHead(h); } });
  });

  // ZADANIE 3.1: Zwiń lewy panel (Biblioteka) domyślnie po uruchomieniu aplikacji
  if (libPanel) {
    const libHead = libPanel.querySelector('.acc-head');
    if (libHead && !libHead.classList.contains('collapsed')) {
      toggleAccHead(libHead);
    }
  }
}

// ZADANIE 3.2: Automatyczne otwieranie panelu źródła
export function openSourcePropertiesPanel() {
  // Szukamy nagłówka akordeonu, w którym znajduje się suwak głośności (volSlider to pewniak z prawego panelu)
  const accContent = volSlider.closest('.acc-content');
  if (accContent) {
    const propsHead = accContent.previousElementSibling;
    if (propsHead && propsHead.classList.contains('acc-head') && propsHead.classList.contains('collapsed')) {
        toggleAccHead(propsHead);
    }
  }
}

export function initControls(){}

// UWAGA: Dodano openSourcePropertiesPanel do listy eksportów!
export { showToast, askConfirm, toggleAccHead, syncSubStates, syncAttrState, setReverbEnabled, scheduleReverbUpdate, openSourcePropertiesPanel };
