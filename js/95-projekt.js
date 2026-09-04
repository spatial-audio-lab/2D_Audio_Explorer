// 95-projekt.js — Zapis i wczytanie projektu (.sal.json) oraz autozapis w przegladarce.
// Czesc Sceny rozbitej na klasyczne skrypty. Kolejnosc ladowania jest kontraktem:
// patrz lista <script> na koncu index.html. Ten plik idzie PO 90-eksport.js, bo korzysta
// z `nazwaPliku()` — czyszczenie nazwy ma zostac w JEDNYM miejscu, tym samym, ktore
// czysci nazwy plikow w archiwum.
//
// PO CO TO JEST. Do wrzesnia 2026 Scena nie miala zadnej trwalosci: zamkniecie karty
// kasowalo caly uklad dzwiekow. Przy trzydziestosekundowej demonstracji to nie boli,
// przy sluchowisku na dziesiec minut przekresla robote.
//
// CZEGO W PROJEKCIE NIE MA I DLACZEGO. Dzwiekow. Plik audio z dysku wazy dziesiatki
// megabajtow, a przegladarka i tak nie odczyta go ponownie bez wskazania przez czlowieka.
// Projekt zapamietuje wiec NAZWE pliku i — gdy uzytkownik wskazal caly folder — SCIEZKE
// WZGLEDNA wobec tego folderu, po czym przy wczytaniu prosi o wskazanie zrodel raz jeszcze.
// Pelnej sciezki dyskowej nie zapisujemy, bo przegladarka jej nie podaje: `<input
// type="file">` oddaje nazwe, rozmiar i zawartosc, i nic ponadto. To blokada bezpieczenstwa,
// nie brak w tym kodzie. Dzwieki z Biblioteki SAL wracaja same, bo wystarczy identyfikator.
//
// GRANICA WOBEC EKSPORTU. Eksport (5) robi pliki do sluchania i do oddania — jest
// nieodwracalny w tym sensie, ze z .wav nie da sie wrocic do ukladania sceny. Projekt (6)
// robi dokladnie to drugie i nie zawiera ani jednej probki dzwieku.

const PROJEKT_FORMAT = 'sal-projekt';
const PROJEKT_WERSJA = 1;
const AUTOZAPIS_KLUCZ = 'sal-scena-autozapis';
const AUTOZAPIS_CO_MS = 2000;

// =========================================================================================
// USTAWIENIA SCENY — pola okna eksportu. Naleza do projektu tak samo jak pozycje dzwiekow:
// kto wraca do sceny, wraca takze do jej nazwy, opisu i czasu nagrania.
// =========================================================================================
const POLA_TEKST   = { numer:'sceneNumber', nazwa:'sceneName', czas:'kpoDuration',
                       opis:'sceneDesc', autor:'sceneAuthor', licencja:'sceneLicense' };
const POLA_PTASZEK = { numerowac:'sceneNumberOn', dataReczna:'kpoDateManual',
                       dataNaMapie:'mapDateOn', poglosWEksporcie:'exportReverb',
                       ruchWEksporcie:'exportMotion' };

function zbierzUstawienia(){
  const o={};
  for(const k in POLA_TEKST){ const el=$(POLA_TEKST[k]); if(el) o[k]=el.value; }
  for(const k in POLA_PTASZEK){ const el=$(POLA_PTASZEK[k]); if(el) o[k]=!!el.checked; }
  const d=$('kpoDate'); if(d) o.data=d.value;
  return o;
}

function nalozUstawienia(o){
  if(!o) return;
  for(const k in POLA_TEKST){
    const el=$(POLA_TEKST[k]);
    if(el && o[k]!==undefined) el.value=o[k];
  }
  for(const k in POLA_PTASZEK){
    const el=$(POLA_PTASZEK[k]);
    if(!el || o[k]===undefined) continue;
    el.checked=!!o[k];
    // Ptaszek trzeba OGLOSIC, a nie tylko przestawic: przy `kpoDateManual` wisi obsluga
    // w 80-ruch.js, ktora odblokowuje pole daty, a przy trzech pozostalych — odswiezenie
    // podpisu sekcji 5.2 w 60-panel.js. Bez zdarzenia model i panel mowia co innego.
    el.dispatchEvent(new Event('change'));
  }
  // Data PO ptaszku, bo obsluga trybu recznego czysci to pole przy wylaczeniu i wpisuje
  // dzisiejsza date przy wlaczeniu — odwrotna kolejnosc zgubilaby zapisana wartosc.
  const d=$('kpoDate'); if(d && o.dataReczna && o.data) d.value=o.data;
}

// =========================================================================================
// ZBIERANIE — model do zwyklego obiektu
// =========================================================================================
function zbierzZrodlo(s){
  const mo=s.motion;
  return {
    nazwa:s.name,
    x:+s.x.toFixed(3), y:+s.y.toFixed(3), wysokosc:+(s.height||0).toFixed(3),
    glosnosc:+s.volume.toFixed(4), tryb:s.routing,
    szerokosc:+(s.width||0).toFixed(3), kat:Math.round(s.spreadAngle||0),
    odtwarzanie:s.playback||'loop', wejscie:+(s.startOffset||0).toFixed(2),
    atrybucja:{ autor:s.attrAuthor||null, licencja:s.attrLicense||null, url:s.attrUrl||null },
    ruch:{
      mode:mo.mode, speed:+mo.speed.toFixed(3),
      orbitRadius:+mo.orbitRadius.toFixed(3), orbitStart:Math.round(mo.orbitStart||0),
      orbitPeriod:+(mo.orbitPeriod||10).toFixed(2),
      originX:+mo.originX.toFixed(3), originY:+mo.originY.toFixed(3),
      randomRange:+mo.randomRange.toFixed(3), seed:mo.seed>>>0,
      pathLoop:!!mo.pathLoop,
      waypoints:(mo.waypoints||[]).map(p=>({ x:+p.x.toFixed(3), y:+p.y.toFixed(3) }))
    },
    // Skad wziac dzwiek przy nastepnym otwarciu. `biblioteka` wraca sama, `dysk` czeka
    // na czlowieka. Rozmiar i dlugosc sa po to, zeby dalo sie poznac wlasciwy plik, gdy
    // ktos ma trzy wersje tego samego nagrania.
    dzwiek: s.libraryId
      ? { skad:'biblioteka', id:s.libraryId }
      : { skad:'dysk', plik:s.plikNazwa||s.name, sciezka:s.plikSciezka||null,
          bajtow:s.plikBajtow||0,
          sekundy:S.buffers[s.id]?+S.buffers[s.id].duration.toFixed(2):0 }
  };
}

function zbierzProjekt(){
  return {
    format:PROJEKT_FORMAT, wersja:PROJEKT_WERSJA,
    zapisano:new Date().toISOString(),
    utworzono:(S.sceneCreatedAt||new Date()).toISOString(),
    ustawienia:zbierzUstawienia(),
    sluchacz:{ x:+S.listener.x.toFixed(3), y:+S.listener.y.toFixed(3), angle:Math.round(S.listener.angle) },
    poglos:{ enabled:reverbState.enabled, wet:+reverbState.wet.toFixed(3),
             roomSize:+reverbState.roomSize.toFixed(3), damping:+reverbState.damping.toFixed(3),
             masterVol:+reverbState.masterVol.toFixed(3) },
    zrodla:S.sources.map(zbierzZrodlo)
  };
}

// =========================================================================================
// NAKLADANIE — obiekt na gotowe zrodlo. Jedna funkcja dla obu drog (biblioteka i dysk),
// bo dzwiek z biblioteki i ten sam dzwiek z dysku maja stac w scenie tak samo.
// =========================================================================================
function nalozZrodlo(s, z){
  if(z.nazwa) s.name=z.nazwa;
  s.x=z.x||0; s.y=z.y||0; s.height=z.wysokosc||0;
  if(z.glosnosc!==undefined){ s.volume=z.glosnosc; s.gain.gain.setValueAtTime(z.glosnosc, audioCtx.currentTime); }
  s.width=z.szerokosc||0; s.spreadAngle=z.kat||0;
  s.playback=z.odtwarzanie==='once'?'once':'loop';
  s.startOffset=z.wejscie||0;
  const a=z.atrybucja||{};
  s.attrAuthor=a.autor||null; s.attrLicense=a.licencja||null; s.attrUrl=a.url||null;

  const r=z.ruch||{}, mo=s.motion;
  mo.speed=r.speed!==undefined?r.speed:mo.speed;
  mo.orbitRadius=r.orbitRadius!==undefined?r.orbitRadius:mo.orbitRadius;
  mo.orbitPeriod=r.orbitPeriod!==undefined?r.orbitPeriod:mo.orbitPeriod;
  mo.originX=r.originX!==undefined?r.originX:s.x;
  mo.originY=r.originY!==undefined?r.originY:s.y;
  mo.randomRange=r.randomRange!==undefined?r.randomRange:mo.randomRange;
  if(r.seed!==undefined) mo.seed=r.seed>>>0;
  mo.pathLoop=r.pathLoop!==false;
  mo.waypoints=(r.waypoints||[]).map(p=>({ x:p.x, y:p.y }));
  mo.pathIndex=0; mo.pathDir=1;
  mo.randomTX=s.x; mo.randomTY=s.y; mo.randomTimer=0;
  mo.mode=r.mode||'static';

  // Tryb ustawia sie PO parametrach, a kat orbity przez `ustawKatOrbity` z 80-ruch.js:
  // przejscie miedzy stopniami od polnocy a radianami od wschodu ma zostac w jednym
  // miejscu. Ta funkcja sadza tez zrodlo na jego okregu, wiec wczytana scena zaczyna
  // dokladnie tam, gdzie zacznie nagranie — a nie o promien obok.
  if(mo.mode==='orbit') ustawKatOrbity(s, r.orbitStart||0);

  if(z.tryb) setRouting(s, z.tryb==='direct'?'direct':'spatial');
  updPanners(s); updateReverbSend(s);
}

// =========================================================================================
// WCZYTANIE
// =========================================================================================
// Dzwieki z dysku, na ktore projekt czeka. Wpis znika, gdy uzytkownik wskaze plik.
let czekajaceZrodla = [];

function opisBrakow(){
  const box=$('brakiBox'), txt=$('brakiTxt');
  if(!box||!txt) return;
  if(!czekajaceZrodla.length){ box.classList.add('hidden'); return; }
  // Sciezka zamiast samej nazwy, gdy projekt ja zna — mowi, w KTORYM folderze szukac.
  // Pelnej sciezki z dysku przegladarka nie podaje nigdy; to, co tu widac, jest
  // sciezka wzgledem folderu, ktory uzytkownik kiedys wskazal.
  const nazwy=czekajaceZrodla.map(w=>w.dzwiek.sciezka||w.dzwiek.plik).join(', ');
  txt.textContent=czekajaceZrodla.length===1
    ? 'Jeden dźwięk czeka na plik z Twojego komputera: '+nazwy
    : czekajaceZrodla.length+' dźwięki czekają na pliki z Twojego komputera: '+nazwy;
  box.classList.remove('hidden');
}

// Kolejnosc na liscie ma byc ta z projektu, a dzwieki wracaja w roznym czasie: te
// z biblioteki od razu, te z dysku dopiero po wskazaniu plikow. Numer zapisany przy
// zrodle pozwala je poustawiac za kazdym razem, gdy cos dojdzie.
function uporzadkujZrodla(){
  S.sources.sort((a,b)=>{
    const na=(a.kolejnoscProjektu===undefined)?9999:a.kolejnoscProjektu;
    const nb=(b.kolejnoscProjektu===undefined)?9999:b.kolejnoscProjektu;
    return na-nb;
  });
}

async function wczytajProjekt(dane, opcje){
  opcje=opcje||{};
  if(!dane || dane.format!==PROJEKT_FORMAT || !Array.isArray(dane.zrodla)){
    showToast('⚠ To nie jest plik projektu Sceny');
    return false;
  }
  if(S.sources.length && !opcje.bezPytania){
    const zgoda=await askConfirm({
      title:'Zastąpić scenę?',
      text:'Wczytanie projektu usunie '+S.sources.length+
           (S.sources.length===1?' dźwięk':' dźwięki')+', które już tu stoją.',
      sub:'Tej operacji nie da się cofnąć.',
      yes:'Tak, wczytaj', no:'Nie, zostaw'
    });
    if(!zgoda) return false;
  }
  stopWszystkie();
  for(const s of S.sources.slice()) removeSource(s.id);
  czekajaceZrodla=[];

  nalozUstawienia(dane.ustawienia);
  if(dane.utworzono){ const d=new Date(dane.utworzono); if(!isNaN(d)) S.sceneCreatedAt=d; }

  const l=dane.sluchacz||{};
  S.listener.x=l.x||0; S.listener.y=l.y||0; S.listener.angle=l.angle||0;
  S.target=null; updateListener();

  const p=dane.poglos||{};
  if(p.enabled!==undefined) reverbState.enabled=!!p.enabled;
  if(p.wet!==undefined) reverbState.wet=p.wet;
  if(p.roomSize!==undefined) reverbState.roomSize=p.roomSize;
  if(p.damping!==undefined) reverbState.damping=p.damping;
  if(p.masterVol!==undefined){ reverbState.masterVol=p.masterVol; masterGain.gain.setValueAtTime(p.masterVol, audioCtx.currentTime); }
  updateReverb();

  let zBiblioteki=0, nieudane=0;
  const potrzebnaBiblioteka=dane.zrodla.some(z=>z.dzwiek && z.dzwiek.skad==='biblioteka');
  if(potrzebnaBiblioteka && !libraryData){
    try { await loadLibrary(); } catch(e){}
  }
  for(let i=0;i<dane.zrodla.length;i++){
    const z=dane.zrodla[i], d=z.dzwiek||{};
    if(d.skad==='biblioteka'){
      const def=libraryData?findInLib(d.id):null;
      if(!def){ nieudane++; continue; }
      // Po kolei, nie rownolegle — tak samo jak przy gotowych scenach: telefon na danych
      // komorkowych ma pobrac kilka nagran, a rownolegly start zabiera pasmo kazdemu.
      const s=await loadFromLib(def, null, { x:z.x||0, y:z.y||0 });
      if(!s){ nieudane++; continue; }
      s.kolejnoscProjektu=i;
      nalozZrodlo(s, z);
      zBiblioteki++;
    } else {
      czekajaceZrodla.push(Object.assign({}, z, { kolejnosc:i, dzwiek:d }));
    }
  }

  uporzadkujZrodla();
  opisBrakow();
  if(S.sources.length) selectSource(S.sources[0]); else updateSel();
  renderSources(); updateCounters(); odswiezWskazniki();

  const czesci=[];
  if(zBiblioteki) czesci.push(zBiblioteki+' z Biblioteki');
  if(czekajaceZrodla.length) czesci.push(czekajaceZrodla.length+' czeka na pliki');
  if(nieudane) czesci.push(nieudane+' nie udało się pobrać');
  showToast('Wczytano projekt'+(czesci.length?' — '+czesci.join(', '):''), czekajaceZrodla.length?0:2500);
  return true;
}

// =========================================================================================
// DOPASOWANIE PLIKOW DO WPISOW, KTORE NA NIE CZEKAJA
// =========================================================================================
// Czego przegladarka NIE daje: pelnej sciezki na dysku. `<input type="file">` oddaje nazwe,
// rozmiar i zawartosc — nic wiecej, i to jest celowa blokada, a nie brak w tym kodzie.
// Jedyny wyjatek to wybor CALEGO FOLDERU: wtedy kazdy plik niesie `webkitRelativePath`,
// czyli sciezke wzgledem wskazanego folderu ("Sluchowisko/kroki/krok_01.wav"). Tyle da sie
// zapisac w projekcie uczciwie i tyle wystarcza, zeby czlowiek wiedzial, gdzie szukac.

const ROZSZERZENIA_AUDIO = /\.(wav|flac|mp3|ogg|opus|m4a|mp4|aac|aif|aiff|webm)$/i;
// Roznica dlugosci, powyzej ktorej plik jest wprawdzie wczytywany, ale z ostrzezeniem.
// Chodzi o przypadek "dwa rozne kroki.wav z dwoch projektow": nazwa ta sama, nagranie inne.
const TOLERANCJA_DLUGOSCI_S = 0.1;

// Wewnetrzny format: { f: File, sciezka: 'folder/podfolder/plik.wav' }. Sciezka bywa pusta
// (wybor pojedynczych plikow) i wtedy zostaje sama nazwa. Funkcja przyjmuje tez zwykla
// liste plikow, zeby wolajacy nie musial wiedziec, skad przyszly.
function naRekordy(lista){
  return Array.from(lista||[]).map(x =>
    (x && x.f) ? x : { f:x, sciezka:(x && x.webkitRelativePath) || '' });
}

function male(t){ return String(t||'').toLowerCase(); }

// Ktory czekajacy wpis pasuje do tego pliku. Kolejnosc prob idzie od najpewniejszej:
//   1. cala sciezka wzgledna,
//   2. ogon sciezki — uzytkownik wskazal podfolder albo folder o poziom wyzej,
//   3. sama nazwa pliku.
// Zwraca indeks w `czekajaceZrodla` albo -1.
function znajdzCzekajacy(rek){
  const sciezka=male(rek.sciezka), nazwa=male(rek.f.name);
  if(sciezka){
    let i=czekajaceZrodla.findIndex(w=>male(w.dzwiek.sciezka)===sciezka);
    if(i>=0) return i;
    i=czekajaceZrodla.findIndex(w=>{
      const zap=male(w.dzwiek.sciezka);
      if(!zap) return false;
      return sciezka.endsWith('/'+zap) || zap.endsWith('/'+sciezka);
    });
    if(i>=0) return i;
  }
  return czekajaceZrodla.findIndex(w=>male(w.dzwiek.plik)===nazwa);
}

// `tylkoDopasowane` odroznia dwa zamiary uzytkownika, ktore wygladaja w kodzie tak samo:
//   - wskazanie PLIKOW to "dodaj mi te dzwieki" — co nie pasuje do braków, wchodzi jako nowe,
//   - wskazanie FOLDERU to "uzupelnij scene z tego folderu" — reszty nie ruszamy.
// Bez tego rozroznienia wskazanie katalogu Muzyka dolozyloby do sceny kilkaset zrodel,
// a praktyczny sufit to 8-12 zrodel HRTF na telefonie.
async function dopasujPliki(pliki, opcje){
  opcje=opcje||{};
  const rekordy=naRekordy(pliki);
  let dopasowane=0, nowe=0, pominiete=0, nieczytelne=0;
  const inneNagranie=[];
  for(const rek of rekordy){
    const f=rek.f;
    const i=znajdzCzekajacy(rek);
    // Dekodowanie dopiero PO decyzji, czy ten plik jest nam potrzebny. Odwrotna kolejnosc
    // znaczylaby dekodowanie calego folderu, zeby na koncu wyrzucic 490 z 500 wynikow.
    if(i<0 && opcje.tylkoDopasowane){ pominiete++; continue; }
    let dane=null;
    try {
      const b=await f.arrayBuffer();
      dane=await audioCtx.decodeAudioData(b);
    } catch(e){
      nieczytelne++;
      if(!opcje.tylkoDopasowane) showToast('⚠ Nie udało się odczytać: '+f.name);
      continue;
    }
    if(i>=0){
      const z=czekajaceZrodla[i];
      const s=createFromBuffer(dane, z.nazwa||cleanFileName(f.name), z.x||0, z.y||0);
      s.plikNazwa=f.name; s.plikSciezka=rek.sciezka||null; s.plikBajtow=f.size;
      s.kolejnoscProjektu=z.kolejnosc;
      nalozZrodlo(s, z);
      // Nazwa pliku to za slabe swiadectwo tozsamosci. Projekt pamieta dlugosc nagrania,
      // wiec da sie powiedziec wprost, ze to NIE jest ten plik — zamiast po cichu postawic
      // w scenie cudze kroki. Plik i tak wchodzi: moze byc po prostu przekodowany.
      const zapisana=(z.dzwiek && z.dzwiek.sekundy)||0;
      if(zapisana>0 && Math.abs(dane.duration-zapisana)>TOLERANCJA_DLUGOSCI_S){
        inneNagranie.push(f.name+' ('+dane.duration.toFixed(2)+' s zamiast '+zapisana.toFixed(2)+' s)');
      }
      czekajaceZrodla.splice(i,1);
      dopasowane++;
    } else {
      const a=Math.random()*Math.PI*2, r=4+Math.random()*10;
      const s=createFromBuffer(dane, cleanFileName(f.name), Math.cos(a)*r, Math.sin(a)*r);
      s.plikNazwa=f.name; s.plikSciezka=rek.sciezka||null; s.plikBajtow=f.size;
      nowe++;
    }
  }
  uporzadkujZrodla();
  opisBrakow();
  renderSources(); updateCounters(); updateSel();

  // Ostrzezenie o innej dlugosci jest wazniejsze niz podsumowanie i zostaje na ekranie,
  // dopoki uzytkownik go nie zamknie — to jedyny moment, w ktorym da sie zlapac pomylke.
  if(inneNagranie.length){
    showToast('⚠ Inne nagranie niż w projekcie: '+inneNagranie.join(', ')+
              '. Wczytane mimo to — sprawdź, czy to właściwy plik.', 0);
    return;
  }
  const cz=[];
  if(dopasowane) cz.push('dopasowano '+dopasowane);
  if(nowe) cz.push(nowe+' dodano jako nowe');
  if(!dopasowane && !nowe){
    if(opcje.tylkoDopasowane)
      showToast(czekajaceZrodla.length
        ? 'W tym folderze nie ma dźwięków, na które czeka scena (przejrzano '+rekordy.length+')'
        : 'Scena nie czeka na żadne pliki — przeciągnij pojedyncze dźwięki, żeby je dodać', 0);
    else if(nieczytelne) showToast('⚠ Żadnego z '+nieczytelne+' plików nie dało się odczytać');
    return;
  }
  if(pominiete) cz.push('pominięto '+pominiete+' spoza sceny');
  showToast(cz.join(', '));
}

// =========================================================================================
// PRZECIAGNIETY FOLDER
// =========================================================================================
// Folder nie jest plikiem. `dataTransfer.files` daje dla niego wpis, ktorego
// `decodeAudioData` nie przyjmie — do wrzesnia 2026 przeciagniecie katalogu konczylo sie
// seria ostrzezen "nie udalo sie odczytac". Sciezka przez `webkitGetAsEntry()` dziala
// w kazdej dzisiejszej przegladarce, takze w Safari, i nie wymaga File System Access API.
//
// Dwie pulapki tego API, obie kosztowaly kiedys ludziom godziny:
//   - `dataTransfer` jest wazny WYLACznie w trakcie obslugi zdarzenia, wiec wpisy trzeba
//     zebrac synchronicznie, PRZED pierwszym `await`;
//   - `readEntries()` oddaje najwyzej 100 pozycji naraz i trzeba je wolac w petli,
//     az zwroci pusta tablice. Katalog na 120 plikow inaczej gubi dwadziescia.
function wpisyZUpuszczenia(dt){
  const wpisy=[];
  if(!dt || !dt.items || !DataTransferItem.prototype.webkitGetAsEntry) return wpisy;
  for(const it of dt.items){
    const w=it.webkitGetAsEntry && it.webkitGetAsEntry();
    if(w) wpisy.push(w);
  }
  return wpisy;
}

function czytajKatalog(reader){
  return new Promise(ok=>reader.readEntries(w=>ok(w), ()=>ok([])));
}
function plikZWpisu(wpis){
  return new Promise(ok=>wpis.file(f=>ok(f), ()=>ok(null)));
}

// Schodzi po katalogu i zbiera wylacznie pliki audio, budujac sciezke wzgledna taka sama,
// jaka daje wybor folderu przez `webkitdirectory` — dzieki temu dopasowanie ma jedno
// zrodlo prawdy niezaleznie od tego, czy folder przeciagnieto, czy wskazano przyciskiem.
async function rekordyZWpisow(wpisy, prefiks){
  const out=[];
  for(const w of wpisy){
    const sciezka=(prefiks?prefiks+'/':'')+w.name;
    if(w.isFile){
      if(!ROZSZERZENIA_AUDIO.test(w.name)) continue;
      const f=await plikZWpisu(w);
      if(f) out.push({ f, sciezka });
    } else if(w.isDirectory){
      const reader=w.createReader();
      const dzieci=[];
      for(;;){
        const porcja=await czytajKatalog(reader);
        if(!porcja.length) break;
        dzieci.push(...porcja);
      }
      out.push(...await rekordyZWpisow(dzieci, sciezka));
    }
  }
  return out;
}

// =========================================================================================
// PLIK NA DYSKU
// =========================================================================================
function zapiszProjektNaDysk(){
  if(!S.sources.length && !czekajaceZrodla.length){ showToast('⚠ Scena jest pusta'); return; }
  const dane=zbierzProjekt();
  // Zrodla czekajace na pliki zostaja w projekcie, mimo ze nie ma ich w scenie. Bez tego
  // zapisanie projektu przed wskazaniem plikow po cichu KASOWALOBY brakujace dzwieki.
  // Wracaja na swoje miejsca w kolejnosci, a nie na koniec listy: kto zapisze projekt
  // dwa razy, ma dostac za drugim razem ten sam uklad, a nie przetasowany.
  if(czekajaceZrodla.length){
    const lista=dane.zrodla.map((z,i)=>{
      const s=S.sources[i];
      return { z, k:(s&&s.kolejnoscProjektu!==undefined)?s.kolejnoscProjektu:i };
    });
    for(const w of czekajaceZrodla){
      const kopia=Object.assign({}, w), k=kopia.kolejnosc;
      delete kopia.kolejnosc;
      lista.push({ z:kopia, k:(k===undefined?9999:k) });
    }
    lista.sort((a,b)=>a.k-b.k);
    dane.zrodla=lista.map(o=>o.z);
  }
  const nazwa=nazwaPliku(($('sceneName').value||'Scena').trim(), 'Scena');
  const blob=new Blob([JSON.stringify(dane,null,1)],{type:'application/json;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download=nazwa+'.sal.json'; a.click();
  URL.revokeObjectURL(a.href);
  showToast('⇩ Zapisano projekt: '+nazwa+'.sal.json');
}

async function otworzProjektZPliku(f){
  try {
    const tekst=await f.text();
    await wczytajProjekt(JSON.parse(tekst));
  } catch(e){ showToast('⚠ Nie udało się odczytać projektu: '+e.message); }
}

// =========================================================================================
// AUTOZAPIS
// =========================================================================================
// Dlaczego zegar, a nie nasluch przy kazdej kontrolce: zmian jest kilkadziesiat rodzajow
// (suwaki, przeciaganie po plotnie, przyciski, pola eksportu), a snapshot calej sceny to
// kilka kilobajtow. Porownanie tekstu ze stanem poprzednim zalatwia to jednym warunkiem,
// zamiast dwudziestoma wywolaniami rozsianymi po plikach.
let ostatniAutozapis='';

function stanAutozapisu(tekst, dobrze){
  const el=$('projStan'); if(!el) return;
  el.textContent='Autozapis: '+tekst;
  el.classList.toggle('zapisano', !!dobrze);
}

function autozapisTik(){
  // Pusta scena nie nadpisuje zapisu. Bez tego warunku wejscie na strone kasowaloby
  // wczorajsza prace, ZANIM uzytkownik zdazylby ja przywrocic.
  if(!S.sources.length && !czekajaceZrodla.length) return;
  // W trakcie odsluchu zrodla w ruchu maja inne x/y w kazdej klatce. Zapis z takiej
  // chwili to pozycja z polowy obiegu, a nie ta, ktora ktos ustawil.
  if(S.sources.some(s=>s.playing)) return;
  let tekst;
  try { tekst=JSON.stringify(zbierzProjekt()); } catch(e){ return; }
  if(tekst===ostatniAutozapis) return;
  try {
    localStorage.setItem(AUTOZAPIS_KLUCZ, tekst);
    ostatniAutozapis=tekst;
    stanAutozapisu('zapisano '+new Date().toLocaleTimeString('pl-PL'), true);
  } catch(e){
    // Pamiec przegladarki bywa niedostepna (tryb prywatny, zablokowane dane witryn).
    // Wtedy mowimy o tym raz i przestajemy probowac przy kazdym tyknieciu.
    stanAutozapisu('niedostępny w tej przeglądarce — zapisuj projekt do pliku');
    clearInterval(zegarAutozapisu);
  }
}

let zegarAutozapisu=null;

function przywrocAutozapis(){
  let tekst=null;
  try { tekst=localStorage.getItem(AUTOZAPIS_KLUCZ); } catch(e){ return; }
  if(!tekst) return;
  let dane=null;
  try { dane=JSON.parse(tekst); } catch(e){ return; }
  if(!dane || dane.format!==PROJEKT_FORMAT || !Array.isArray(dane.zrodla) || !dane.zrodla.length) return;

  const bar=$('wznowBar'), txt=$('wznowTxt');
  if(!bar) return;
  const kiedy=dane.zapisano?new Date(dane.zapisano):null;
  const nazwa=(dane.ustawienia&&dane.ustawienia.nazwa)?dane.ustawienia.nazwa.trim():'';
  const ile=dane.zrodla.length;
  if(txt){
    // Cudzyslowy sa ASCII, nie polskie. Znaki typograficzne w <script> to w tym repo
    // stala mina skladniowa — patrz skill polish-quotes-safety.
    txt.textContent='Ostatnia scena'+(nazwa?' "'+nazwa+'"':'')+' — '+ile+
      (ile===1?' dźwięk':' dźwięki')+
      (kiedy&&!isNaN(kiedy)?', '+kiedy.toLocaleString('pl-PL'):'');
  }
  bar.classList.remove('hidden');
  $('wznowTak').addEventListener('click', async ()=>{
    bar.classList.add('hidden');
    await wczytajProjekt(dane, { bezPytania:true });
  }, { once:true });
  $('wznowNie').addEventListener('click', ()=>{
    bar.classList.add('hidden');
    try { localStorage.removeItem(AUTOZAPIS_KLUCZ); } catch(e){}
    stanAutozapisu('czeka na pierwszy dźwięk');
  }, { once:true });
  // Krzyzyk to trzecie wyjscie: zamyka pasek i NIE kasuje zapisu. Bez niego pasek byl
  // oknem bez wyjscia — zeby go zamknac, trzeba bylo podjac decyzje, ktorej uzytkownik
  // moze jeszcze nie chciec podejmowac. Zapis wraca przy nastepnym otwarciu strony.
  const zamknij=$('wznowZamknij');
  if(zamknij) zamknij.addEventListener('click', ()=>{
    bar.classList.add('hidden');
    showToast('Zapis czeka — wróci przy następnym otwarciu strony');
  }, { once:true });
}

// =========================================================================================
// WPIECIE W PANEL
// =========================================================================================
(function wepnijProjekt(){
  const zap=$('zapiszProjektBtn'), wcz=$('wczytajProjektBtn'), inp=$('projektInput');
  const bBtn=$('brakiBtn'), bInp=$('brakiInput');
  if(zap) zap.addEventListener('click', zapiszProjektNaDysk);
  if(wcz&&inp){
    wcz.addEventListener('click', ()=>inp.click());
    inp.addEventListener('change', ()=>{ if(inp.files[0]) otworzProjektZPliku(inp.files[0]); inp.value=''; });
  }
  if(bBtn&&bInp){
    bBtn.addEventListener('click', ()=>bInp.click());
    bInp.addEventListener('change', ()=>{ dopasujPliki(bInp.files); bInp.value=''; });
  }
  // Wybor folderu. `webkitdirectory` jest w kazdej przegladarce desktopowej, ale na
  // telefonie bywa go brak — wtedy przycisk ZNIKA, zamiast otwierac okno, ktore nic nie robi.
  const fBtn=$('brakiFolderBtn'), fInp=$('brakiFolderInput');
  if(fBtn&&fInp){
    if(!('webkitdirectory' in fInp)) fBtn.style.display='none';
    else {
      fBtn.addEventListener('click', ()=>fInp.click());
      fInp.addEventListener('change', ()=>{
        // Z folderu bierzemy WYLACZNIE to, na co scena czeka — patrz `tylkoDopasowane`.
        dopasujPliki(fInp.files, { tylkoDopasowane:true });
        fInp.value='';
      });
    }
  }
  przywrocAutozapis();
  zegarAutozapisu=setInterval(autozapisTik, AUTOZAPIS_CO_MS);
})();
