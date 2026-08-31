// 84-fala.js — Fala wybranego dzwieku w prawym panelu: obwiednia szczytow i kursor
// pokazujacy, w ktorym miejscu nagrania jestesmy.
// Czesc Sceny rozbitej na klasyczne skrypty. Kolejnosc ladowania jest kontraktem:
// patrz lista <script> na koncu index.html. Ten plik idzie PRZED 85-rysowanie.js,
// bo petla klatek w 85 wola stad rysujFale().
//
// Po co osobny plik: obwiednia liczy sie raz na dzwiek i laduje w plotnie poza ekranem.
// Petla klatek przerysowuje tylko kursor, wiec 60 klatek na sekunde kosztuje jedno
// drawImage i jedna kreske, a nie kilkaset odcinkow.

// Ile slupkow miesci sie w fali. Jeden slupek = jedna kolumna pikseli plotna.
// Wiecej nie ma sensu — plotno i tak ma tyle pikseli, ile ma.
const FALA_TLO = '#0A0C08';

// Pamiec podreczna: id zrodla -> { plotno, szer, dl }. Kasuje sie przy zmianie
// szerokosci panelu (inna szerokosc = inna liczba slupkow) i przy usunieciu zrodla.
const FALE = {};

// Szczyty licza sie z MIKSU MONO wszystkich kanalow — tak samo jak obwiednia glosnosci
// w 90-eksport.js. Gdyby liczyc z samego kanalu 0, nagranie stereo z rozjechanymi
// kanalami pokazywaloby polowe tego, co slychac.
function policzSzczyty(buffer, kolumny){
  const nCh=buffer.numberOfChannels, len=buffer.length;
  const chans=[]; for(let c=0;c<nCh;c++) chans.push(buffer.getChannelData(c));
  const out=new Float32Array(kolumny*2);
  for(let k=0;k<kolumny;k++){
    const od=Math.floor(k*len/kolumny), doo=Math.max(od+1,Math.floor((k+1)*len/kolumny));
    let mn=0, mx=0;
    for(let i=od;i<doo && i<len;i++){
      let m=0; for(let c=0;c<nCh;c++) m+=chans[c][i];
      m/=nCh;
      if(m<mn) mn=m; if(m>mx) mx=m;
    }
    out[k*2]=mn; out[k*2+1]=mx;
  }
  return out;
}

// Plotno poza ekranem z sama fala. Rysowane raz na dzwiek.
function malujFale(buffer, szer, wys){
  const p=document.createElement('canvas'); p.width=szer; p.height=wys;
  const c=p.getContext('2d');
  c.fillStyle=FALA_TLO; c.fillRect(0,0,szer,wys);
  const sr=wys/2, sk=wys/2-1;
  const szczyty=policzSzczyty(buffer, szer);
  c.strokeStyle='rgba(0,229,204,0.55)'; c.lineWidth=1;
  c.beginPath();
  for(let k=0;k<szer;k++){
    // +0.5 stawia kreske na srodku piksela, inaczej rozmywa sie na dwa.
    const x=k+0.5;
    const g=sr-szczyty[k*2+1]*sk, d=sr-szczyty[k*2]*sk;
    c.moveTo(x, g); c.lineTo(x, Math.max(d, g+1));
  }
  c.stroke();
  // Os zerowa — bez niej cicha koncowka wyglada jak uszkodzony plik.
  c.strokeStyle='rgba(240,235,224,0.10)';
  c.beginPath(); c.moveTo(0,sr+0.5); c.lineTo(szer,sr+0.5); c.stroke();
  return p;
}

// Gdzie jestesmy w nagraniu, w sekundach. null = nic nie gra albo nie wiadomo.
// Wartosc UJEMNA znaczy, ze zrodlo czeka na swoja sekunde w scenie i tyle jeszcze
// brakuje. Strumien z biblioteki niesie wlasny zegar; bufor z dysku nie ma zadnego,
// wiec liczymy od chwili startu zapisanej w playSource (s.startedAt).
function pozycjaOdtwarzania(s){
  if(!s||!s.playing) return null;
  if(s.isStream) return s.audioElement ? s.audioElement.currentTime : null;
  const buf=S.buffers[s.id];
  if(!buf||s.startedAt==null) return null;
  const t=audioCtx.currentTime-s.startedAt;
  if(t<0) return t;
  // Tryb Raz konczy sie na koncu nagrania; petla zawija sie i liczy od nowa.
  return s.playback==='once' ? Math.min(t,buf.duration) : t%buf.duration;
}

function czasNapis(sek){
  const m=Math.floor(sek/60), s=sek-m*60;
  return m>0 ? m+':'+(s<10?'0':'')+s.toFixed(1) : s.toFixed(1)+' s';
}

// Wolane z petli klatek w 85-rysowanie.js.
function rysujFale(){
  const p=$('falaCanvas'); if(!p) return;
  const s=S.selectedSource;
  const szerCss=p.clientWidth|0;
  if(szerCss<=0) return;                      // panel zwiniety — nie ma czego rysowac
  const dpr=window.devicePixelRatio||1;
  const szer=Math.round(szerCss*dpr), wys=Math.round(p.clientHeight*dpr);
  if(p.width!==szer||p.height!==wys){ p.width=szer; p.height=wys; odswiezFale(); }
  const c=p.getContext('2d');
  c.fillStyle=FALA_TLO; c.fillRect(0,0,szer,wys);

  const buf=s&&!s.isStream ? S.buffers[s.id] : null;
  if(!s||!buf){
    // Strumien z biblioteki nie ma bufora w pamieci, wiec fali nie ma z czego policzyc.
    c.fillStyle='rgba(156,152,144,0.55)';
    c.font=Math.round(12*dpr)+"px 'Azeret Mono',monospace";
    c.textAlign='center'; c.textBaseline='middle';
    c.fillText(s?'strumień — brak fali':'— brak wyboru —', szer/2, wys/2);
    $('falaCzas').textContent='—';
    return;
  }

  let wpis=FALE[s.id];
  if(!wpis||wpis.szer!==szer){ wpis={ plotno:malujFale(buf,szer,wys), szer, dl:buf.duration }; FALE[s.id]=wpis; }
  c.drawImage(wpis.plotno,0,0);

  const poz=pozycjaOdtwarzania(s);
  if(poz===null){
    $('falaCzas').textContent=czasNapis(buf.duration);
    return;
  }
  if(poz<0){
    // Zrodlo czeka na swoja sekunde. Kursora nie ma, bo nie ma czego wskazywac.
    $('falaCzas').textContent='wejście za '+czasNapis(-poz);
    return;
  }
  const wybrzmial = s.playback==='once' && poz>=buf.duration;
  const x=Math.round((Math.min(poz,buf.duration)/buf.duration)*szer)+0.5;
  // Przebyta czesc przygasa, zeby kierunek byl widoczny bez patrzenia na kursor.
  c.fillStyle='rgba(10,12,8,0.45)'; c.fillRect(0,0,x,wys);
  // Po wybrzmieniu kursor gasnie do szarosci: zrodlo jest jeszcze w scenie i jedzie
  // po swojej trajektorii, ale juz nie brzmi.
  c.strokeStyle=wybrzmial?'rgba(156,152,144,0.8)':'#FFAB00'; c.lineWidth=Math.max(1,Math.round(dpr));
  c.beginPath(); c.moveTo(x,0); c.lineTo(x,wys); c.stroke();
  $('falaCzas').textContent = wybrzmial
    ? 'wybrzmiał · '+czasNapis(buf.duration)
    : czasNapis(poz)+' / '+czasNapis(buf.duration);
}

// Kasuje pamiec podreczna. Wolane przy zmianie szerokosci plotna i przy usuwaniu zrodla.
function odswiezFale(id){
  if(id) delete FALE[id];
  else for(const k of Object.keys(FALE)) delete FALE[k];
}
