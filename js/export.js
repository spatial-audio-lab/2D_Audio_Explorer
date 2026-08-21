import { $, S } from './dom-state.js';
import { audioCtx, reverbState, generateIR } from './audio-engine.js';
import { askConfirm, showToast } from './ui.js';
import { maRuch, simulateTrajectory, rampParam } from './motion.js';

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


export function initExport(){ $('generateExport').addEventListener('click', exportScene); }
export { bufToWav, floatArraysToWav32, levelEnvelope, levelToB64, exportStep, exportScene };
