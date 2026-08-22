// 60-panel.js — PRAWY PANEL. Jedna tablica opisow (KONTROLKI) zamiast kontrolki
// rozsmarowanej po pieciu miejscach. Z jednego opisu wynika: wartosc poczatkowa,
// format podpisu, zapis do modelu, RESET przy braku zaznaczenia i wygaszanie.
// Dodanie kontrolki = jeden obiekt w tablicy. Usuniecie = skasowanie obiektu.
// Czesc Sceny rozbitej na klasyczne skrypty. Kolejnosc ladowania jest kontraktem:
// patrz lista <script> na koncu index.html.
//
// Publiczne wejscia, z ktorych korzystaja inne pliki (50-zrodlo.js, 80-ruch.js):
//   updateSel()  renderSources()  updateCounters()  syncSubStates()
// Nazwy zostaja te same, zeby przebudowa panelu nie wyciekala poza ten plik.

// =========================================================================================
// REJESTR KONTROLEK — jedyne miejsce, w ktorym opisuje sie kontrolke prawego panelu.
// =========================================================================================
// Pola opisu:
//   nazwa     — klucz w kodzie, nie w DOM
//   typ       — 'suwak' | 'tekst' | 'grupa'
//   wej       — id elementu wejsciowego; dla grupy id pojemnika z przyciskami
//   pole      — id elementu z podpisem wartosci (suwak)
//   zasieg    — 'zrodlo' (dotyczy wybranego dzwieku) | 'scena' (dotyczy calej sceny)
//   skala     — wartosc modelu = surowa wartosc suwaka * skala
//   pusta     — co pokazac, gdy nie ma zaznaczonego zrodla
//   czyta     — model -> wartosc; przy zasiegu 'scena' wolane bez argumentu
//   pisze     — wartosc -> model, razem z efektem w grafie audio
//   format    — wartosc -> tekst podpisu
//   odswiezListe / odswiezWszystko — co przeliczyc po zmianie
const KONTROLKI = [
  // ----- 3. Wybrany dzwiek -------------------------------------------------------------
  { nazwa:'nazwa', typ:'tekst', wej:'selName', zasieg:'zrodlo',
    wlasnyNasluch:true, klasaPusta:'empty',
    czyta:s=>s.name },

  { nazwa:'autor', typ:'tekst', wej:'selAuthor', zasieg:'zrodlo',
    czyta:s=>s.attrAuthor||'', pisze:(s,v)=>{ s.attrAuthor=v.trim()||null; } },
  { nazwa:'licencja', typ:'tekst', wej:'selLicense', zasieg:'zrodlo',
    czyta:s=>s.attrLicense||'', pisze:(s,v)=>{ s.attrLicense=v.trim()||null; } },
  { nazwa:'link', typ:'tekst', wej:'selUrl', zasieg:'zrodlo',
    czyta:s=>s.attrUrl||'', pisze:(s,v)=>{ s.attrUrl=v.trim()||null; } },

  { nazwa:'routing', typ:'grupa', wej:'routingToggle', atrybut:'route', zasieg:'zrodlo',
    klasy:['active','active-direct'], klasaAktywna:v=>v==='direct'?'active-direct':'active',
    pusta:'spatial', czyta:s=>s.routing,
    pisze:(s,v)=>{ setRouting(s,v); showToast(v==='direct'?'♫ Direct Stereo':'◎ Spatial HRTF'); },
    odswiezWszystko:true, odswiezListe:true },

  { nazwa:'glosnosc', typ:'suwak', wej:'volSlider', pole:'volVal', zasieg:'zrodlo',
    skala:0.01, pusta:0.7, format:v=>Math.round(v*100)+'%',
    czyta:s=>s.volume,
    pisze:(s,v)=>{ s.volume=v; s.gain.gain.setValueAtTime(v,audioCtx.currentTime); },
    odswiezListe:true },

  { nazwa:'wysokosc', typ:'suwak', wej:'heightSlider', pole:'heightVal', zasieg:'zrodlo',
    skala:0.1, pusta:0, format:v=>v.toFixed(1)+'m',
    czyta:s=>s.height||0,
    pisze:(s,v)=>{ s.height=v; updPanners(s); } },

  { nazwa:'szerokosc', typ:'suwak', wej:'widthSlider', pole:'widthVal', zasieg:'zrodlo',
    skala:0.1, pusta:0, format:v=>v.toFixed(1)+'m',
    czyta:s=>s.width,
    pisze:(s,v)=>{ s.width=v; updPanners(s); },
    odswiezListe:true },

  { nazwa:'kat', typ:'suwak', wej:'angleSlider', pole:'angleVal', zasieg:'zrodlo',
    skala:1, pusta:0, format:v=>Math.round(v)+'°',
    czyta:s=>s.spreadAngle,
    pisze:(s,v)=>{ s.spreadAngle=v; updPanners(s); } },

  // Orbita i random licza sie wzgledem punktu, w ktorym dzwiek stal w chwili wlaczenia
  // trybu — dlatego origin zapisuje sie przy PRZEJSCIU, nie przy kazdym kliknieciu.
  { nazwa:'ruch', typ:'grupa', wej:'motionModeRow', atrybut:'motion', zasieg:'zrodlo',
    klasy:['active'], klasaAktywna:()=>'active',
    pusta:'static', czyta:s=>s.motion.mode,
    pisze:(s,v)=>{
      const mo=s.motion;
      if((v==='orbit'||v==='random') && mo.mode!==v){
        mo.originX=s.x; mo.originY=s.y;
        if(v==='orbit') mo.orbitAngle=0;
        if(v==='random'){ mo.randomTX=s.x; mo.randomTY=s.y; mo.randomTimer=0; }
      }
      mo.mode=v;
      showToast('Ruch: '+(MOTION_TOAST[v]||v));
    },
    odswiezWszystko:true },

  { nazwa:'predkosc', typ:'suwak', wej:'motionSpeed', pole:'motionSpeedVal', zasieg:'zrodlo',
    skala:0.1, pusta:2, format:v=>v.toFixed(1),
    czyta:s=>s.motion.speed, pisze:(s,v)=>{ s.motion.speed=v; } },

  { nazwa:'promien', typ:'suwak', wej:'orbitRadius', pole:'orbitRadiusVal', zasieg:'zrodlo',
    skala:0.1, pusta:5, format:v=>v.toFixed(1)+'m',
    czyta:s=>s.motion.orbitRadius, pisze:(s,v)=>{ s.motion.orbitRadius=v; } },

  { nazwa:'bladzenie', typ:'suwak', wej:'randomRange', pole:'randomRangeVal', zasieg:'zrodlo',
    skala:0.1, pusta:8, format:v=>v.toFixed(1)+'m',
    czyta:s=>s.motion.randomRange, pisze:(s,v)=>{ s.motion.randomRange=v; } },

  { nazwa:'petla', typ:'suwak', wej:'pathLoop', pole:'pathLoopVal', zasieg:'zrodlo',
    skala:1, pusta:1, format:v=>v?'Tak':'Nie',
    czyta:s=>s.motion.pathLoop?1:0, pisze:(s,v)=>{ s.motion.pathLoop=v===1; } },

  // ----- 4. Przestrzen -----------------------------------------------------------------
  { nazwa:'master', typ:'suwak', wej:'masterVolSlider', pole:'masterVolVal', zasieg:'scena',
    skala:0.01, format:v=>Math.round(v*100)+'%',
    czyta:()=>reverbState.masterVol,
    pisze:(_,v)=>{ reverbState.masterVol=v; masterGain.gain.setTargetAtTime(v,audioCtx.currentTime,0.02); } },

  { nazwa:'wet', typ:'suwak', wej:'reverbWet', pole:'reverbWetVal', zasieg:'scena',
    skala:0.01, format:v=>Math.round(v*100)+'%',
    czyta:()=>reverbState.wet,
    pisze:(_,v)=>{ reverbState.wet=v; if(reverbState.enabled) reverbOutput.gain.setTargetAtTime(v,audioCtx.currentTime,0.05); } },

  { nazwa:'rozmiar', typ:'suwak', wej:'reverbSize', pole:'reverbSizeVal', zasieg:'scena',
    skala:0.01, format:v=>v.toFixed(2),
    czyta:()=>reverbState.roomSize,
    pisze:(_,v)=>{ reverbState.roomSize=v; scheduleReverbUpdate(); } },

  { nazwa:'tlumienie', typ:'suwak', wej:'reverbDamp', pole:'reverbDampVal', zasieg:'scena',
    skala:0.01, format:v=>v.toFixed(2),
    czyta:()=>reverbState.damping,
    pisze:(_,v)=>{ reverbState.damping=v; scheduleReverbUpdate(); } },
];

// Sekcje, ktore otwieraja sie albo gasna zaleznie od stanu wybranego zrodla.
// Jeden wiersz = jedna regula widocznosci.
const WIDOCZNOSC = [
  { el:'orbitParams',    klasa:'open',     gdy:s=>!!s && s.motion.mode==='orbit'  },
  { el:'randomParams',   klasa:'open',     gdy:s=>!!s && s.motion.mode==='random' },
  { el:'pathParams',     klasa:'open',     gdy:s=>!!s && s.motion.mode==='path'   },
  { el:'spatialSection', klasa:'disabled', gdy:s=>!!s && s.routing==='direct'     },
];

const MOTION_LABEL={static:'Statyczny',orbit:'Orbita',random:'Random',path:'Ścieżka'};
const MOTION_TOAST={static:'Statyczny',orbit:'Orbita',random:'Random Walk',path:'Ścieżka'};

// Podpisy stanu — to, co naglowek podsekcji pokazuje BEZ rozwijania. Wskaznik szerokosci
// czyta suwak, a nie model, bo ma nadazac za palcem takze wtedy, gdy nic nie jest wybrane.
const WSKAZNIKI = [
  { el:'stereoInd', tekst:()=>wartosc('szerokosc')>0.05?'Stereo':'Punkt',
    klasa:'wide', gdy:()=>wartosc('szerokosc')>0.05 },
  { el:'attrState', tekst:s=>{
      if(!s) return '—';
      const p=[]; if(s.attrAuthor) p.push(s.attrAuthor); if(s.attrLicense) p.push(s.attrLicense);
      return p.length?p.join(' · '):'nie podano';
    } },
  { el:'motionState', tekst:s=>s?(MOTION_LABEL[s.motion.mode]||'—'):'—' },
  { el:'reverbState2', tekst:()=>reverbState.enabled?('włączony · '+Math.round(reverbState.wet*100)+'%'):'wyłączony' },
  { el:'sceneAttrState', tekst:()=>{
      const p=[];
      if(($('sceneDesc').value||'').trim()) p.push('opis');
      const a=($('sceneAuthor').value||'').trim(); if(a) p.push(a);
      const l=($('sceneLicense').value||'').trim(); if(l) p.push(l);
      return p.length?p.join(' · '):'nie podano';
    } },
  { el:'fileOptState', tekst:()=>[
      $('exportReverb').checked?'pogłos':'bez pogłosu',
      $('exportMotion').checked?'z ruchem':'bez ruchu',
      $('mapDateOn').checked?'data na mapie':'bez daty'
    ].join(', ') },
];

// =========================================================================================
// SILNIK — nic ponizej nie wie, ile jest kontrolek ani jak sie nazywaja.
// =========================================================================================
const WG_WEJSCIA = Object.fromEntries(KONTROLKI.map(k=>[k.wej,k]));
const WG_NAZWY   = Object.fromEntries(KONTROLKI.map(k=>[k.nazwa,k]));
const GRUPY_WG_ATRYBUTU = Object.fromEntries(KONTROLKI.filter(k=>k.typ==='grupa').map(k=>[k.atrybut,k]));

// Biezaca wartosc suwaka odczytana z DOM, juz w jednostkach modelu.
function wartosc(nazwa){
  const k=WG_NAZWY[nazwa], el=k&&$(k.wej);
  return el ? parseFloat(el.value)*k.skala : 0;
}

// model -> DOM
function pokaz(k){
  const s=S.selectedSource;
  const jestCel = k.zasieg==='scena' || !!s;

  if(k.typ==='grupa'){
    const poj=$(k.wej); if(!poj) return;
    const v = jestCel ? (k.zasieg==='scena' ? k.czyta() : k.czyta(s)) : k.pusta;
    poj.querySelectorAll('[data-'+k.atrybut+']').forEach(b=>{
      b.classList.remove.apply(b.classList, k.klasy);
      if(b.dataset[k.atrybut]===v) b.classList.add(k.klasaAktywna(v));
    });
    return;
  }

  const el=$(k.wej); if(!el) return;

  if(k.typ==='tekst'){
    el.value = jestCel ? (k.czyta(s)||'') : '';
    el.disabled = !jestCel;
    if(k.klasaPusta) el.classList.toggle(k.klasaPusta, !jestCel);
    return;
  }

  const v = jestCel ? (k.zasieg==='scena' ? k.czyta() : k.czyta(s)) : k.pusta;
  el.value = Math.round(v/k.skala);
  const pole=$(k.pole); if(pole) pole.textContent=k.format(v);
}

// DOM -> model. Podpis aktualizuje sie zawsze, zapis tylko wtedy, gdy jest do czego pisac.
function zapisz(k, surowa){
  const s=S.selectedSource;
  const v = k.typ==='suwak' ? parseFloat(surowa)*k.skala : surowa;

  if(k.typ==='suwak'){ const pole=$(k.pole); if(pole) pole.textContent=k.format(v); }

  if(k.zasieg==='zrodlo' && !s){ odswiezWskazniki(); return; }
  if(k.pisze) k.pisze(k.zasieg==='scena' ? null : s, v);

  if(k.odswiezWszystko) updateSel();
  if(k.odswiezListe) renderSources();
  odswiezWskazniki();
}

function odswiezWidocznosc(){
  const s=S.selectedSource;
  for(const w of WIDOCZNOSC){ const el=$(w.el); if(el) el.classList.toggle(w.klasa, w.gdy(s)); }
}

function odswiezWskazniki(){
  const s=S.selectedSource;
  for(const w of WSKAZNIKI){
    const el=$(w.el); if(!el) continue;
    el.textContent=w.tekst(s);
    if(w.klasa) el.classList.toggle(w.klasa, w.gdy(s));
  }
}

// Publiczne: pelna synchronizacja panelu ze stanem. Zaden opis nie moze zostac pominiety,
// bo to jedna petla po tablicy — stad zniknal rozjazd galezi "jest wybor" i "brak wyboru".
function updateSel(){
  for(const k of KONTROLKI) pokaz(k);
  odswiezWidocznosc();
  odswiezWskazniki();
  if(!S.selectedSource){ selDist.textContent='—'; selAbsorb.textContent='—'; }
}

// Zostaje pod stara nazwa, bo wola ja 50-zrodlo.js. Dzis to sam odswiez wskaznikow.
function syncSubStates(){ odswiezWskazniki(); }

// =========================================================================================
// NASLUCHY — po jednym na typ zdarzenia, delegowane z calego panelu. Kontrolka nie
// potrzebuje wlasnego addEventListener, wiec dodanie jej to nadal jeden obiekt w tablicy.
// =========================================================================================
const sidebar=$('sidebar');

sidebar.addEventListener('input', e=>{
  const k=WG_WEJSCIA[e.target.id];
  if(k && !k.wlasnyNasluch) zapisz(k, e.target.value);
});

sidebar.addEventListener('click', e=>{
  for(const atr in GRUPY_WG_ATRYBUTU){
    const b=e.target.closest('[data-'+atr+']');
    if(!b) continue;
    const k=GRUPY_WG_ATRYBUTU[atr];
    if(k.zasieg==='scena' || S.selectedSource) zapisz(k, b.dataset[atr]);
    return;
  }
});

// =========================================================================================
// LISTA ZRODEL I LICZNIKI
// =========================================================================================
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

// =========================================================================================
// RESZTA PANELU — to, co nie jest kontrolka parametru
// =========================================================================================
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

['sceneDesc','sceneAuthor','sceneLicense'].forEach(id=>$(id).addEventListener('input', odswiezWskazniki));
['exportReverb','exportMotion','mapDateOn'].forEach(id=>$(id).addEventListener('change', odswiezWskazniki));

// Nazwa dzwieku — zmieniana w locie, bez przycisku "zapisz". Pusta wraca do poprzedniej,
// zeby zaden obiekt nie wyladowal na kuli w Sferze bez podpisu. Stad wlasnyNasluch w opisie:
// pusty ciag NIE jest tu poprawna wartoscia, wiec generyczny zapis by przeszkadzal.
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

$('clearPathBtn').addEventListener('click', e=>{ e.stopPropagation(); if(!S.selectedSource) return; S.selectedSource.motion.waypoints=[]; S.selectedSource.motion.pathIndex=0; S.selectedSource.motion.pathDir=1; showToast('Ścieżka wyczyszczona'); });

function setReverbEnabled(on){
  reverbState.enabled=on;
  const btn=$('reverbEnableBtn'); btn.textContent=on?'Włączony':'Wyłączony'; btn.classList.toggle('active',on); btn.setAttribute('aria-pressed',on?'true':'false');
  reverbOutput.gain.setTargetAtTime(on?reverbState.wet:0,audioCtx.currentTime,0.05);
  odswiezWskazniki();
  for(const s of S.sources) updateReverbSend(s);
}
$('reverbEnableBtn').addEventListener('click', ()=>setReverbEnabled(!reverbState.enabled));

let reverbUpdateTimer=null;
function scheduleReverbUpdate(){ if(reverbUpdateTimer) clearTimeout(reverbUpdateTimer); reverbUpdateTimer=setTimeout(()=>{ updateReverb(); showToast('Reverb zaktualizowany'); },300); }
