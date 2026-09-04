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
//   telefon   — czy kontrolka jest w SKROCONYM panelu telefonu. Pole jest OBOWIAZKOWE:
//               harness nie przepusci opisu bez jawnej decyzji, bo "zapomnialem" i
//               "swiadomie schowalem" wygladaja w kodzie tak samo. Ponizej 900 px
//               kontrolki z `telefon:false` chowa klasa `poza-telefonem`, dopoki
//               uzytkownik nie naciśnie "Pokaż wszystkie ustawienia".
//   typ       — 'suwak' | 'tekst' | 'grupa'
//   wej       — id elementu wejsciowego; dla grupy id pojemnika z przyciskami
//   pole      — id elementu z podpisem wartosci (suwak)
//   zasieg    — 'zrodlo' (dotyczy wybranego dzwieku) | 'scena' (dotyczy calej sceny)
//   skala     — wartosc modelu = surowa wartosc suwaka * skala
//   zakres    — GORNA GRANICA suwaka w jednostkach modelu, przeliczana przy kazdym
//               odswiezeniu panelu. Pole opcjonalne: bez niego obowiazuje `max` z HTML-a.
//               Jest po to, zeby suwak, ktorego zakres zalezy od sceny, nie klamal.
//   pusta     — co pokazac, gdy nie ma zaznaczonego zrodla
//   czyta     — model -> wartosc; przy zasiegu 'scena' wolane bez argumentu
//   pisze     — wartosc -> model, razem z efektem w grafie audio
//   format    — wartosc -> tekst podpisu
//   odswiezListe / odswiezWszystko — co przeliczyc po zmianie
const KONTROLKI = [
  // ----- 3. Wybrany dzwiek -------------------------------------------------------------
  { nazwa:'nazwa', telefon:true, typ:'tekst', wej:'selName', zasieg:'zrodlo',
    wlasnyNasluch:true, klasaPusta:'empty',
    czyta:s=>s.name },

  { nazwa:'autor', telefon:false, typ:'tekst', wej:'selAuthor', zasieg:'zrodlo',
    czyta:s=>s.attrAuthor||'', pisze:(s,v)=>{ s.attrAuthor=v.trim()||null; } },
  { nazwa:'licencja', telefon:false, typ:'tekst', wej:'selLicense', zasieg:'zrodlo',
    czyta:s=>s.attrLicense||'', pisze:(s,v)=>{ s.attrLicense=v.trim()||null; } },
  { nazwa:'link', telefon:false, typ:'tekst', wej:'selUrl', zasieg:'zrodlo',
    czyta:s=>s.attrUrl||'', pisze:(s,v)=>{ s.attrUrl=v.trim()||null; } },

  // Loop albo Raz. Slowo "petla" jest tu celowo NIEUZYTE — nizej stoi suwak Petla,
  // ktory dotyczy petli TRAJEKTORII (czy dzwiek wraca na poczatek sciezki). Dwie
  // "petle" w jednym panelu znaczylyby dwie rozne rzeczy.
  // Zmiana w trakcie grania dziala od razu: flaga loop wezla da sie przestawic na zywo.
  { nazwa:'odtwarzanie', telefon:false, typ:'grupa', wej:'playbackToggle', atrybut:'playback', zasieg:'zrodlo',
    klasy:['active'], klasaAktywna:()=>'active',
    pusta:'loop', czyta:s=>s.playback||'loop',
    pisze:(s,v)=>{
      s.playback=v;
      if(s.node) s.node.loop=(v!=='once');
      if(s.isStream&&s.audioElement) s.audioElement.loop=(v!=='once');
      showToast(v==='once'?'Odtwarzanie: raz':'Odtwarzanie: loop');
    },
    // Bez odswiezWszystko klasa active zostaje na starym przycisku: klasy grupy
    // przestawia pokaz(), a ta chodzi tylko przez updateSel().
    odswiezWszystko:true, odswiezListe:true },

  // Sekunda sceny, w ktorej zrodlo wchodzi. Suwak zmienia PARAMETR — na biegnaca scene
  // nie wplywa, bo wejscia sa zaplanowane w Web Audio przy nacisnieciu Wszystkie.
  // Zakres idzie za CZASEM NAGRANIA z okna eksportu, a nie za sztywnym `max` w HTML-u.
  // Wczesniej konczyl sie na 60 s (max 120 przy skali 0,5) niezaleznie od tego, ze
  // nagranie moze trwac 600 s — kwestii z drugiej polowy sluchowiska nie dalo sie ustawic.
  // Skrocenie nagrania NIE przesuwa zrodla, ktore stoi dalej: gorna granica podnosi sie
  // wtedy do jego wejscia, zeby suwak pokazywal prawde. Ze zrodla nie slychac, mowi lista
  // (dopisek "poza nagraniem") i META.
  { nazwa:'wejscie', telefon:false, typ:'suwak', wej:'startOffset', pole:'startOffsetVal', zasieg:'zrodlo',
    skala:0.5, pusta:0, format:v=>v.toFixed(1)+' s',
    zakres:s=>Math.max(czasEksportu(), s?(s.startOffset||0):0),
    czyta:s=>s.startOffset||0, pisze:(s,v)=>{ s.startOffset=v; },
    odswiezListe:true },

  { nazwa:'routing', telefon:true, typ:'grupa', wej:'routingToggle', atrybut:'route', zasieg:'zrodlo',
    klasy:['active','active-direct'], klasaAktywna:v=>v==='direct'?'active-direct':'active',
    pusta:'spatial', czyta:s=>s.routing,
    pisze:(s,v)=>{ setRouting(s,v); showToast(v==='direct'?'♫ Direct Stereo':'◎ Spatial HRTF'); },
    odswiezWszystko:true, odswiezListe:true },

  { nazwa:'glosnosc', telefon:true, typ:'suwak', wej:'volSlider', pole:'volVal', zasieg:'zrodlo',
    skala:0.01, pusta:0.7, format:v=>Math.round(v*100)+'%',
    czyta:s=>s.volume,
    pisze:(s,v)=>{ s.volume=v; s.gain.gain.setValueAtTime(v,audioCtx.currentTime); },
    odswiezListe:true },

  { nazwa:'wysokosc', telefon:false, typ:'suwak', wej:'heightSlider', pole:'heightVal', zasieg:'zrodlo',
    skala:0.1, pusta:0, format:v=>v.toFixed(1)+'m',
    czyta:s=>s.height||0,
    pisze:(s,v)=>{ s.height=v; updPanners(s); } },

  { nazwa:'szerokosc', telefon:false, typ:'suwak', wej:'widthSlider', pole:'widthVal', zasieg:'zrodlo',
    skala:0.1, pusta:0, format:v=>v.toFixed(1)+'m',
    czyta:s=>s.width,
    pisze:(s,v)=>{ s.width=v; updPanners(s); },
    odswiezListe:true },

  { nazwa:'kat', telefon:false, typ:'suwak', wej:'angleSlider', pole:'angleVal', zasieg:'zrodlo',
    skala:1, pusta:0, format:v=>Math.round(v)+'°',
    czyta:s=>s.spreadAngle,
    pisze:(s,v)=>{ s.spreadAngle=v; updPanners(s); } },

  // Orbita i random licza sie wzgledem punktu, w ktorym dzwiek stal w chwili wlaczenia
  // trybu — dlatego origin zapisuje sie przy PRZEJSCIU, nie przy kazdym kliknieciu.
  { nazwa:'ruch', telefon:true, typ:'grupa', wej:'motionModeRow', atrybut:'motion', zasieg:'zrodlo',
    klasy:['active'], klasaAktywna:()=>'active',
    pusta:'static', czyta:s=>s.motion.mode,
    pisze:(s,v)=>{
      const mo=s.motion;
      if(v==='orbit' && mo.mode!==v){
        // Srodek ODSUWA sie od dzwieku o promien, zamiast ladowac pod nim. Dzieki temu
        // dzwiek zostaje dokladnie tam, gdzie go postawiono, i od razu lezy na okregu
        // pod katem z suwaka Start — a nie skacze o caly promien przy pierwszej klatce.
        mo.originX=s.x-Math.cos(mo.orbitAngle)*mo.orbitRadius;
        mo.originY=s.y-Math.sin(mo.orbitAngle)*mo.orbitRadius;
      }
      if(v==='random' && mo.mode!==v){
        mo.originX=s.x; mo.originY=s.y;
        mo.randomTX=s.x; mo.randomTY=s.y; mo.randomTimer=0;
      }
      mo.mode=v;
      showToast('Ruch: '+(MOTION_TOAST[v]||v));
    },
    odswiezWszystko:true },

  { nazwa:'predkosc', telefon:true, typ:'suwak', wej:'motionSpeed', pole:'motionSpeedVal', zasieg:'zrodlo',
    skala:0.1, pusta:2, format:v=>v.toFixed(1),
    czyta:s=>s.motion.speed, pisze:(s,v)=>{ s.motion.speed=v; } },

  { nazwa:'promien', telefon:true, typ:'suwak', wej:'orbitRadius', pole:'orbitRadiusVal', zasieg:'zrodlo',
    skala:0.1, pusta:5, format:v=>v.toFixed(1)+'m',
    czyta:s=>s.motion.orbitRadius,
    // Okrag rosnie wokol swojego srodka, a dzwiek zostaje na jego brzegu.
    pisze:(s,v)=>{ s.motion.orbitRadius=v; if(s.motion.mode==='orbit') ustawNaOrbicie(s); },
    odswiezListe:true },

  // Start liczony od POLNOCY, bo tam patrzy sluchacz. To PARAMETR, nie odczyt biezacej
  // pozycji: od niego rusza odsluch, nagranie i powrot po nacisnieciu Stop.
  { nazwa:'start', telefon:true, typ:'suwak', wej:'orbitStart', pole:'orbitStartVal', zasieg:'zrodlo',
    skala:1, pusta:0, format:v=>Math.round(v)+'°',
    czyta:s=>katStartu(s.motion),
    pisze:(s,v)=>{ ustawKatOrbity(s, v); },
    odswiezListe:true },

  { nazwa:'obieg', telefon:true, typ:'suwak', wej:'orbitPeriod', pole:'orbitPeriodVal', zasieg:'zrodlo',
    skala:0.5, pusta:10, format:v=>v.toFixed(1)+' s',
    czyta:s=>s.motion.orbitPeriod||10, pisze:(s,v)=>{ s.motion.orbitPeriod=v; } },

  { nazwa:'bladzenie', telefon:true, typ:'suwak', wej:'randomRange', pole:'randomRangeVal', zasieg:'zrodlo',
    skala:0.1, pusta:8, format:v=>v.toFixed(1)+'m',
    czyta:s=>s.motion.randomRange, pisze:(s,v)=>{ s.motion.randomRange=v; } },

  { nazwa:'petla', telefon:true, typ:'suwak', wej:'pathLoop', pole:'pathLoopVal', zasieg:'zrodlo',
    skala:1, pusta:1, format:v=>v?'Tak':'Nie',
    czyta:s=>s.motion.pathLoop?1:0, pisze:(s,v)=>{ s.motion.pathLoop=v===1; } },

  // ----- 4. Przestrzen -----------------------------------------------------------------
  { nazwa:'master', telefon:true, typ:'suwak', wej:'masterVolSlider', pole:'masterVolVal', zasieg:'scena',
    skala:0.01, format:v=>Math.round(v*100)+'%',
    czyta:()=>reverbState.masterVol,
    pisze:(_,v)=>{ reverbState.masterVol=v; masterGain.gain.setTargetAtTime(v,audioCtx.currentTime,0.02); } },

  { nazwa:'wet', telefon:false, typ:'suwak', wej:'reverbWet', pole:'reverbWetVal', zasieg:'scena',
    skala:0.01, format:v=>Math.round(v*100)+'%',
    czyta:()=>reverbState.wet,
    pisze:(_,v)=>{ reverbState.wet=v; if(reverbState.enabled) reverbOutput.gain.setTargetAtTime(v,audioCtx.currentTime,0.05); } },

  { nazwa:'rozmiar', telefon:false, typ:'suwak', wej:'reverbSize', pole:'reverbSizeVal', zasieg:'scena',
    skala:0.01, format:v=>v.toFixed(2),
    czyta:()=>reverbState.roomSize,
    pisze:(_,v)=>{ reverbState.roomSize=v; scheduleReverbUpdate(); } },

  { nazwa:'tlumienie', telefon:false, typ:'suwak', wej:'reverbDamp', pole:'reverbDampVal', zasieg:'scena',
    skala:0.01, format:v=>v.toFixed(2),
    czyta:()=>reverbState.damping,
    pisze:(_,v)=>{ reverbState.damping=v; scheduleReverbUpdate(); } },
];

// Sekcje, ktore otwieraja sie albo gasna zaleznie od stanu wybranego zrodla.
// Jeden wiersz = jedna regula widocznosci.
const WIDOCZNOSC = [
  { el:'speedParams',    klasa:'open',     gdy:s=>!!s && (s.motion.mode==='random'||s.motion.mode==='path') },
  { el:'orbitParams',    klasa:'open',     gdy:s=>!!s && s.motion.mode==='orbit'  },
  { el:'randomParams',   klasa:'open',     gdy:s=>!!s && s.motion.mode==='random' },
  { el:'pathParams',     klasa:'open',     gdy:s=>!!s && s.motion.mode==='path'   },
  { el:'spatialSection', klasa:'disabled', gdy:s=>!!s && s.routing==='direct'     },
];

// Pojemniki, ktorych rejestr nie zna, bo nie sa kontrolkami: podsekcje i blok markupu.
// Rejestr opisuje POJEDYNCZE kontrolki — cala podsekcja "Szerokosc stereo" to naglowek,
// tresc i wskaznik stanu, wiec chowanie jej suwak po suwaku zostawiloby pusty naglowek.
const POJEMNIKI_POZA_TELEFONEM = [
  '#attrBox',      // atrybucja pojedynczego dzwieku — praca redakcyjna, nie demonstracja
  '#stereoBox',    // 3.1 szerokosc stereo
  '#reverbBox',    // 4.1 poglos
  '#eksportPanel', // 5. eksport — poza zakresem "salonu demonstracyjnego"
  '#projektPanel'  // 6. projekt — zapis roboczy jest robota, a nie demonstracja
];

// Rozwiesza klase `poza-telefonem` na wszystkim, co nie nalezy do skroconego panelu.
// Robione RAZ, przy starcie: to jest stala wlasnosc kontrolki, a nie stan, ktory
// zmienia sie z zaznaczeniem zrodla. Widocznoscia steruje potem sama klasa CSS.
function oznaczPozaTelefonem(){
  for(const k of KONTROLKI){
    if(k.telefon) continue;
    const el=$(k.wej); if(!el) continue;
    // Chowamy CALY wiersz, nie samo wejscie — inaczej zostaje podpis bez suwaka.
    const wiersz=el.closest('.param-row')||el.closest('.routing-toggle')||el;
    wiersz.classList.add('poza-telefonem');
  }
  for(const sel of POJEMNIKI_POZA_TELEFONEM)
    document.querySelectorAll(sel).forEach(e=>e.classList.add('poza-telefonem'));
}

// Przelacznik skroconego panelu. Klasa siedzi na #sidebar, a nie na kazdym elemencie:
// jeden przelot CSS zamiast dwudziestu dwoch przestawien klas przy kazdym kliknieciu.
function ustawSkrotPanelu(skrocony){
  sidebar.classList.toggle('panel-skrocony', skrocony);
  const b=$('panelPrzelacznik'); if(!b) return;
  b.textContent = skrocony ? 'Pokaż wszystkie ustawienia' : 'Pokaż tylko podstawowe';
  b.setAttribute('aria-expanded', skrocony ? 'false' : 'true');
}
oznaczPozaTelefonem();
(function wepnijPrzelacznikPanelu(){
  const b=$('panelPrzelacznik'); if(!b) return;
  b.addEventListener('click', ()=>ustawSkrotPanelu(!sidebar.classList.contains('panel-skrocony')));
  ustawSkrotPanelu(true);
})();

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
  // Zakres PRZED wartoscia: przegladarka przycina `value` do biezacego `max`, wiec
  // odwrotna kolejnosc gubilaby wejscie ustawione dalej, niz siega stary suwak.
  if(k.zakres) el.max = Math.max(1, Math.round(k.zakres(jestCel?s:null)/k.skala));
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
// Uchwyt `sidebar` deklaruje 10-stan.js razem z pozostalymi uchwytami DOM.
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

// Czas nagrania stoi w oknie eksportu, czyli POZA panelem — nasluch z `sidebar` go nie
// widzi. A od niego zalezy zakres suwaka Wejscie i dopisek "poza nagraniem" na liscie,
// wiec obie te rzeczy trzeba przeliczyc, gdy uzytkownik zmieni czas.
(function pilnujCzasuNagrania(){
  const el=$('kpoDuration'); if(!el) return;
  el.addEventListener('input', ()=>{ updateSel(); renderSources(); });
})();

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
    // Trzy stany czasu na liscie. "czeka" i "wybrzmial" to zrodla, ktore SA w scenie
    // (jada po swojej trajektorii), ale nic z nich nie slychac — bez podpisu wygladaja
    // jak zepsute. Czekanie poznaje sie po zaplanowanym starcie w przyszlosci.
    const pTag=s.playback==='once'?' · raz':'';
    // Wejscie ustawione dalej niz czas nagrania nie jest bledem — moze byc etapem pracy
    // ("najpierw ustaw, potem wydluz nagranie"). Ale w eksporcie takiego zrodla NIE MA
    // (planOdtwarzania: gra = wejscie < dur), wiec lista musi to powiedziec od razu,
    // a nie dopiero META po wygenerowaniu plikow.
    const poza=(s.startOffset||0)>=czasEksportu();
    const oTag=(s.startOffset||0)>0.01
      ? ' · wejście '+(s.startOffset).toFixed(1)+'s'+(poza?' (poza nagraniem)':'')
      : '';
    const czeka=s.playing&&s.startedAt!=null&&audioCtx.currentTime<s.startedAt;
    const sTag=s.playing&&!s.brzmi?(czeka?' · czeka':' · wybrzmiał'):'';
    const hAbs=Math.abs(s.height||0);
    const hTag=hAbs>0.2?' · '+(s.height>0?'↑':'↓')+hAbs.toFixed(1)+'m':'';
    return `<div class="source-item ${S.selectedSource===s?'selected':''} ${s.playing?'playing':''}" data-id="${s.id}" role="button" tabindex="0" aria-label="Zaznacz źródło ${s.name}"><div class="src-num">${i+1}</div><div class="src-info"><div class="src-name">${s.name}</div><div class="src-meta">${d}m · ${Math.round(s.volume*100)}%${hTag}${wTag}${rTag}${mTag}${pTag}${oTag}${sTag}${s.isStream?' · stream':''}</div></div><button class="src-btn ${s.playing?'active':''}" data-a="t" aria-label="${s.playing?'Zatrzymaj':'Odtwórz'} ${s.name}">${s.playing?'‖':'▶'}</button><button class="src-btn del" data-a="d" aria-label="Usuń ${s.name}">✕</button></div>`;
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
// "Wszystkie" to ZERO sceny: od tej chwili liczy sie suwak Wejscie przy kazdym zrodle.
// Pojedyncze play przy zrodle na liscie omija zegar i gra od razu — to podglad brzmienia.
$('playAllBtn').addEventListener('click', graWszystkie);
$('stopAllBtn').addEventListener('click', stopWszystkie);
$('tPlayAll').addEventListener('click', ()=>{ S.sources.some(s=>s.playing)?stopWszystkie():graWszystkie(); });
$('tStopAll').addEventListener('click', stopWszystkie);

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
// Przelacznik dodawania punktow palcem. `ustawDodawaniePunktow` mieszka w 80-ruch.js,
// czyli w pliku ladowanym PO tym — deklaracja funkcji sie hoistuje, a wolamy ja i tak
// dopiero z klikniecia, wiec kolejnosc nie ma tu znaczenia.
$('addPathBtn').addEventListener('click', e=>{ e.stopPropagation(); ustawDodawaniePunktow(!S.dodawaniePunktow); showToast(S.dodawaniePunktow?'Dotykaj sceny, żeby dokładać punkty':'Dodawanie punktów wyłączone'); });

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
