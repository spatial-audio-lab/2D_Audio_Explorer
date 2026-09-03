// 20-ui.js — Drobne mechanizmy interfejsu: toast, okno potwierdzenia, akordeon.
// Czesc Sceny rozbitej na klasyczne skrypty. Kolejnosc ladowania jest kontraktem:
// patrz lista <script> na koncu index.html.

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

// ZWIJANIE — jeden mechanizm dla calej apki
// Siatka 0fr -> 1fr animuje sie do rzeczywistej wysokosci tresci, ale wymaga jednego
// opakowania z overflow:hidden. Opakowanie dokladane jest tutaj, a nie w markupie, zeby
// nowa sekcja dostawala plynna animacje sama, bez pamietania o dodatkowym <div>.
function opakujZwijane(sel){
  document.querySelectorAll(sel).forEach(el=>{
    if(el.children.length===1 && el.firstElementChild.classList.contains('zwijane-wnetrze')) return;
    const w=document.createElement('div'); w.className='zwijane-wnetrze';
    const c=document.createElement('div'); c.className='zwijane-tresc';
    while(el.firstChild) c.appendChild(el.firstChild);
    w.appendChild(c); el.appendChild(w);
  });
}
['.acc-body','.motion-params','.sub-body'].forEach(opakujZwijane);

// Podsekcje (3.1 Szerokosc stereo, 3.2 Ruch, 4.1 Reverb ...) nie sa juz <details>.
function przelaczSubBox(h){
  const box=h.closest('.sub-box'); if(!box) return;
  const otwarty=box.classList.toggle('open');
  h.setAttribute('aria-expanded', otwarty?'true':'false');
}
document.addEventListener('click', e=>{
  const h=e.target.closest && e.target.closest('.sub-summary');
  if(h) przelaczSubBox(h);
});
document.addEventListener('keydown', e=>{
  if(e.key!=='Enter' && e.key!==' ') return;
  const h=e.target.closest && e.target.closest('.sub-summary');
  if(h){ e.preventDefault(); przelaczSubBox(h); }
});

// ACCORDION
function toggleAccHead(h){ const collapsed=h.classList.toggle('collapsed'); h.setAttribute('aria-expanded', collapsed?'false':'true'); }
document.querySelectorAll('.acc-head').forEach(h => {
  h.addEventListener('click', () => toggleAccHead(h));
  h.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' '){ e.preventDefault(); toggleAccHead(h); } });
});

// SZUFLADA — prawy panel na telefonie.
// Klasa `szuflada-otwarta` znaczy cos WYLACZNIE ponizej 900 px; wyzej reguly jej nie
// czytaja, wiec zostawienie jej na elemencie po obroceniu telefonu nic nie psuje.
// Stan trzyma klasa na elemencie, a nie osobna zmienna — inaczej po zmianie szerokosci
// okna zmienna i wyglad zaczelyby mowic co innego.
function ustawSzuflade(otwarta){
  const u=$('szufladaUchwyt'); if(!u) return;
  sidebar.classList.toggle('szuflada-otwarta', otwarta);
  u.setAttribute('aria-expanded', otwarta?'true':'false');
  // Otwierana szuflada zaczyna od gory: po zamknieciu i ponownym otwarciu uzytkownik
  // ma zobaczyc sekcje 1, a nie miejsce, w ktorym skonczyl przewijac poprzednio.
  if(otwarta) sidebar.scrollTop=0;
}
(function wepnijSzuflade(){
  const u=$('szufladaUchwyt'); if(!u) return;
  u.addEventListener('click', ()=>ustawSzuflade(!sidebar.classList.contains('szuflada-otwarta')));
})();

// Krzyzyk biblioteki. Na telefonie biblioteka przykrywa cale plotno, wiec bez tego
// przycisku nie da sie do niej wrocic. `ustawBiblioteke` mieszka w 40-biblioteka.js,
// czyli w pliku ladowanym PO tym — deklaracja funkcji sie hoistuje, ale wolamy ja
// dopiero z klikniecia, wiec kolejnosc i tak nie ma tu znaczenia.
(function wepnijZamknijBiblioteke(){
  const z=$('libZamknij'); if(!z) return;
  z.addEventListener('click', ()=>ustawBiblioteke(false));
})();

