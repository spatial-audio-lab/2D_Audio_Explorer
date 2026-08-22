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

// ACCORDION
function toggleAccHead(h){ const collapsed=h.classList.toggle('collapsed'); h.setAttribute('aria-expanded', collapsed?'false':'true'); }
document.querySelectorAll('.acc-head').forEach(h => {
  h.addEventListener('click', () => toggleAccHead(h));
  h.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' '){ e.preventDefault(); toggleAccHead(h); } });
});

