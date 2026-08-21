import { $ } from './dom-state.js';

// HELP
const helpTabs={basic:['helpTabBasic','helpBasic'],advanced:['helpTabAdvanced','helpAdvanced'],glossary:['helpTabGlossary','helpGlossary'],eco:['helpTabEco','helpEco']};
function setHelpTab(tab){
  for(const key in helpTabs){
    const active=key===tab, [btnId,panelId]=helpTabs[key];
    $(btnId).classList.toggle('active',active); $(btnId).setAttribute('aria-selected',active?'true':'false');
    $(panelId).style.display=active?'':'none';
  }
}


// --- PASEK MARKI v3.1: zakladki, modale, burger ---------------------------------------
// Wzorzec i zachowanie 1:1 z implementacja referencyjna (sekwencer, src/js/header.js):
// zakladka z atrybutem data-modal otwiera okno, zamyka je krzyzyk, klik w tlo i Escape,
// a fokus wraca na zakladke, z ktorej okno otwarto.
let ostatniaZakladka = null;
function otworzModal(modal, zrodlo){
  if(!modal) return;
  ostatniaZakladka = zrodlo || document.activeElement;
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden','false');
  const x = modal.querySelector('[data-close-modal]');
  if(x) x.focus();
}
function zamknijModal(modal){
  if(!modal || !modal.classList.contains('is-open')) return;
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden','true');
  if(ostatniaZakladka && typeof ostatniaZakladka.focus === 'function') ostatniaZakladka.focus();
}
function zamknijWszystkieModale(){
  document.querySelectorAll('.sal-modal-overlay.is-open').forEach(zamknijModal);
}
function nakladkaOtwarta(){
  return document.querySelector('.sal-modal-overlay.is-open') ? true : false;
}


// KEYBOARD
// Skroty klawiszowe milkna, gdy uzytkownik pisze. Wczesniej sprawdzany byl tylko
// tagName==='INPUT', wiec spacja w polu OPISU SCENY (textarea) zatrzymywala odtwarzanie
// zamiast wpisac odstep. Liczy sie kazde pole edytowalne, lacznie z contenteditable.


export function initModalUI(){
  $('helpTabBasic').addEventListener('click', ()=>setHelpTab('basic'));
  $('helpTabAdvanced').addEventListener('click', ()=>setHelpTab('advanced'));
  $('helpTabGlossary').addEventListener('click', ()=>setHelpTab('glossary'));
  $('helpTabEco').addEventListener('click', ()=>setHelpTab('eco'));
  (function wepnijPasek(){
    const burger = $('salBurger'), menu = $('salMobileMenu');
    if(burger && menu){
      burger.addEventListener('click', ()=>{
        const otwarte = menu.classList.toggle('is-open');
        burger.setAttribute('aria-expanded', otwarte ? 'true' : 'false');
      });
    }
    document.querySelectorAll('[data-tab]').forEach(el=>{
      el.addEventListener('click', e=>{
        const id = el.getAttribute('data-modal');
        if(id){ e.preventDefault(); setHelpTab('basic'); otworzModal($(id), el); }
        // Pozycja bez wlasnego okna dziala jak przycisk apki. W menu mobilnym to tylko
        // powtorzenie zakladki z paska, wiec przekazuje klikniecie oryginalowi.
        const proxy = el.getAttribute('data-proxy');
        if(proxy && $(proxy)) $(proxy).click();
        if(menu) menu.classList.remove('is-open');
        if(burger) burger.setAttribute('aria-expanded','false');
      });
    });
    document.querySelectorAll('.sal-modal-overlay').forEach(ov=>{
      ov.addEventListener('click', e=>{ if(e.target===ov) zamknijModal(ov); });
      ov.querySelectorAll('[data-close-modal]').forEach(b=>b.addEventListener('click', ()=>zamknijModal(ov)));
    });
    document.addEventListener('keydown', e=>{
      if(e.key==='Escape' && nakladkaOtwarta()){ zamknijWszystkieModale(); e.preventDefault(); }
    });
  })();
}
export { setHelpTab, otworzModal, zamknijModal, zamknijWszystkieModale, nakladkaOtwarta };
