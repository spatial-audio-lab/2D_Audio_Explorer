// 40-biblioteka.js — Lewy panel: drzewo library.json, szukanie, wstawianie dzwieku na scene.
// Czesc Sceny rozbitej na klasyczne skrypty. Kolejnosc ladowania jest kontraktem:
// patrz lista <script> na koncu index.html.

// LIBRARY
// Panel startuje zwiniety (klasa w index.html), a jego stan pokazuje przycisk w sekcji 01 —
// dzieki temu nie trzeba zgadywac, czy biblioteka jest otwarta. library.json wczytuje sie
// przy pierwszym otwarciu, nie przy starcie: kto pracuje na wlasnych plikach, nigdy go nie pobiera.
function ustawBiblioteke(otwarta){
  libPanel.classList.toggle('collapsed', !otwarta);
  const b=$('pickLibrary');
  if(b){ b.classList.toggle('active', otwarta); b.setAttribute('aria-expanded', otwarta?'true':'false'); }
  if(otwarta && !libraryData) loadLibrary();
}
$('pickLibrary').addEventListener('click', ()=>ustawBiblioteke(libPanel.classList.contains('collapsed')));
const catIcons = {nature:'∿', mood:'◐'};
const subIcons = {nature_water:'≋', nature_fire:'△', nature_birds:'♪', nature_insects:'⁘', nature_mammals:'◦', mood_calm:'○'};
async function loadLibrary(){
  libTree.innerHTML='<div class="lib-empty-msg">Ładowanie…</div>';
  try { const r=await fetch('library.json'); if(!r.ok) throw new Error('HTTP '+r.status); libraryData=await r.json(); libCountBadge.textContent=(libraryData.total_sounds||0)+' dźwięków'; renderLibTree(); }
  catch(e){ libTree.innerHTML='<div class="lib-empty-msg">Nie można załadować library.json</div>'; }
}
// Szukanie sklada polskie znaki do postaci bez ogonkow PO OBU STRONACH: 'strumien' znajduje
// 'strumień', a 'ogień' znajduje 'ogien'. Bez tego trafienie zalezy od tego, czy uzytkownikowi
// chcialo sie siegnac po prawy alt — a to nie jest kryterium wyszukiwania.
const OGONKI={'ą':'a','ć':'c','ę':'e','ł':'l','ń':'n','ó':'o','ś':'s','ź':'z','ż':'z'};
function bezOgonkow(s){ return String(s||'').toLowerCase().replace(/[ąćęłńóśźż]/g, z=>OGONKI[z]); }

function renderLibTree(){
  if(!libraryData) return;
  const q=bezOgonkow(libSearchQuery).trim();
  const zwin=!q;                       // bez szukania: same naglowki dzialow
  let html='';
  for(const cat of libraryData.categories){
    let subs=[];
    for(const sub of (cat.subcategories||[])){
      // Nazwa dzialu tez jest szukana. Uzytkownik widzi w drzewie 'Ptaki' i 'Wnetrza',
      // wiec wpisanie tego wprost ma pokazac caly dzial, a nie zero wynikow.
      const wDziale = bezOgonkow(cat.label+' '+sub.label).includes(q);
      const sounds=(sub.sounds||[]).filter(s => {
        if(!q || wDziale) return true;
        return bezOgonkow(s.label).includes(q)
            || (s.tags||[]).some(t=>bezOgonkow(t).includes(q))
            || bezOgonkow(s.author).includes(q);
      });
      if(!sounds.length) continue;
      const sh=sounds.map(s => {
        const dur=s.duration?Math.round(s.duration)+'s':'', lic=s.license?.short||'?', licCls=lic==='CC0'?'cc0':'', isStream=!s.file;
        const attr=s.license?.attribution?`<div class="lib-sound-attr">© <a href="${s.freesound_url}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${s.author}</a></div>`:'';
        return `<div class="lib-sound"><div><div class="lib-sound-name" title="${s.label}">${s.label}</div><div class="lib-sound-meta">${dur?'<span>'+dur+'</span>':''}<span class="lib-badge ${licCls}">${lic}</span>${isStream?'<span class="lib-badge stream">Stream</span>':''}</div>${attr}<div class="lib-sound-status">⏳ Pobieranie…</div></div><button class="lib-add-btn" data-add="${s.id}">+</button></div>`;
      }).join('');
      subs.push(`<div><div class="lib-sub-head${zwin?' collapsed':''}" data-tsub="${sub.id}" role="button" tabindex="0" aria-expanded="${zwin?'false':'true'}"><i class="ico">${subIcons[sub.id]||'·'}</i><span>${sub.label}</span><span class="cnt">${sounds.length}</span><span class="arrow">▾</span></div><div class="lib-sub-body" id="sub-${sub.id}">${sh}</div></div>`);
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

