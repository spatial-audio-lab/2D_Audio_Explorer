// 55-sceny-demo.js — Gotowe sceny na jedno dotkniecie (sekcja 1).
// Czesc Sceny rozbitej na klasyczne skrypty. Kolejnosc ladowania jest kontraktem:
// patrz lista <script> na koncu index.html. Ten plik idzie PO 50-zrodlo.js, bo
// korzysta z `loadFromLib` i `findInLib`; funkcje panelu (`selectSource`,
// `renderSources`) woła dopiero z klikniecia, wiec ich pozniejsze zaladowanie
// niczego nie psuje.
//
// Zasada: ten plik NIE pobiera i NIE dekoduje dzwiekow. Wszystko idzie przez
// `loadFromLib` z 50-zrodlo.js — razem z awaryjnym przejsciem na strumien. Druga
// implementacja tej samej sciezki to dokladnie ten blad, ktory kiedys dal cztery
// rozne kierunki jednego zrodla w jednym archiwum.

let scenyDemo = null;
let ladowanieSceny = false;

// Na file:// fetch pada tak samo jak przy library.json. Wtedy caly wiersz znika —
// uzytkownik widzi sekcje 1 dokladnie taka, jaka byla przed ta funkcja, zamiast
// trzech przyciskow, ktore nic nie robia.
async function wczytajScenyDemo(){
  try {
    const r = await fetch('sceny-demo.json');
    if(!r.ok) throw new Error('HTTP '+r.status);
    scenyDemo = await r.json();
    rysujPrzyciskiScen();
  } catch(e){
    const box = $('demoBox');
    if(box) box.style.display = 'none';
  }
}

function rysujPrzyciskiScen(){
  const row = $('demoRow');
  if(!row || !scenyDemo) return;
  row.innerHTML = '';
  for(const sc of scenyDemo.sceny){
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'demo-btn';
    b.dataset.scena = sc.id;
    b.title = sc.podpowiedz || '';
    b.innerHTML = '<span class="demo-btn-nazwa"></span><span class="demo-btn-uczy"></span>';
    b.querySelector('.demo-btn-nazwa').textContent = sc.nazwa;
    b.querySelector('.demo-btn-uczy').textContent = sc.czego_uczy || '';
    b.addEventListener('click', ()=>uruchomSceneDemo(sc));
    row.appendChild(b);
  }
}

// Ustawienie ruchu idzie przez `ustawKatOrbity` z 80-ruch.js, a nie przez wlasny
// wzor na kat. W modelu kat jest w radianach i liczy sie od wschodu, a na suwaku
// Start w stopniach od polnocy; przejscie miedzy tymi dwiema konwencjami ma zostac
// w JEDNYM miejscu, bo inaczej obraz rozjedzie sie z dzwiekiem.
function ustawRuchDemo(s, ruch){
  if(!ruch || ruch.mode!=='orbit') return;
  const mo = s.motion;
  mo.orbitRadius = ruch.promien;
  mo.orbitPeriod = ruch.obieg;
  // Srodek orbity to sluchacz: gotowa scena ma krazyc wokol glowy, a nie wokol
  // przypadkowego punktu. `ustawKatOrbity` sadza zrodlo na okregu wokol tego srodka.
  mo.originX = 0; mo.originY = 0;
  mo.mode = 'orbit';
  ustawKatOrbity(s, ruch.start || 0);
}

async function uruchomSceneDemo(sc){
  if(ladowanieSceny) return;

  if(S.sources.length){
    const zgoda = await askConfirm({
      title: 'Zastąpić scenę?',
      text: 'Wczytanie gotowej sceny usunie '+S.sources.length+
            (S.sources.length===1?' dźwięk':' dźwięki')+', które już tu stoją.',
      sub: 'Tej operacji nie da się cofnąć.',
      yes: 'Tak, wczytaj', no: 'Nie, zostaw'
    });
    if(!zgoda) return;
    stopWszystkie();
    for(const s of S.sources.slice()) removeSource(s.id);
  }

  ladowanieSceny = true;
  document.querySelectorAll('.demo-btn').forEach(b=>b.classList.add('disabled'));
  let pierwsze = null, nieudane = 0;
  try {
    // Gotowa scena wskazuje dzwieki po identyfikatorze z library.json, a ten wczytuje
    // sie dopiero przy pierwszym otwarciu Biblioteki. Kto zaczyna od gotowej sceny,
    // Biblioteki jeszcze nie otwieral.
    if(!libraryData) await loadLibrary();
    for(const z of sc.zrodla){
      const def = findInLib(z.sound);
      if(!def){ nieudane++; continue; }
      // Po kolei, nie rownolegle: telefon na danych komorkowych ma pobrac trzy albo
      // cztery nagrania, a rownolegly start zabiera pasmo kazdemu z nich naraz.
      const s = await loadFromLib(def, null, { x: z.x||0, y: z.y||0 });
      if(!s){ nieudane++; continue; }
      if(z.vol!==undefined){ s.volume=z.vol; s.gain.gain.setValueAtTime(z.vol, audioCtx.currentTime); }
      if(z.routing) setRouting(s, z.routing);
      ustawRuchDemo(s, z.ruch);
      if(!pierwsze) pierwsze = s;
    }
  } finally {
    ladowanieSceny = false;
    document.querySelectorAll('.demo-btn').forEach(b=>b.classList.remove('disabled'));
  }

  if(!pierwsze){ showToast('⚠ Nie udało się wczytać sceny'); return; }
  // Nazwa sceny mieszka w polu okna eksportu i nigdzie indziej — `S.sceneName` istnieje
  // w modelu, ale nikt go nie czyta, a 90-eksport.js bierze wartosc wprost stad.
  const pole = $('sceneName'); if(pole) pole.value = sc.nazwa;
  selectSource(pierwsze);
  renderSources(); updateCounters(); odswiezWskazniki();
  showToast(nieudane ? sc.nazwa+' — brakuje '+nieudane+' dźwięku' : sc.podpowiedz || sc.nazwa, 6000);
}

wczytajScenyDemo();
