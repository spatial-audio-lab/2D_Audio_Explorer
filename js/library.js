import { $, S, libPanel, libTree, libSearch, libCountBadge } from './dom-state.js';
import { audioCtx } from './audio-engine.js';
import { showToast } from './ui.js';
import { createFromBuffer, createFromStream } from './sources.js';

// LIBRARY
let libraryData = null, libSearchQuery = '';

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

export function initLibrary(){
  $('libToggle').addEventListener('click', () => { const c=libPanel.classList.toggle('collapsed'); if(!c && !libraryData) loadLibrary(); });
  libSearch.addEventListener('input', () => { libSearchQuery=libSearch.value; if(libraryData) renderLibTree(); });
}

export { loadLibrary, renderLibTree, findInLib, updateLibBtns, applyAttr, loadFromLib };
