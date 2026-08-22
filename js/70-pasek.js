// 70-pasek.js — Pasek marki v3.1: zakladki, modale Pomoc / O projekcie, burger, klawiatura.
// Czesc Sceny rozbitej na klasyczne skrypty. Kolejnosc ladowania jest kontraktem:
// patrz lista <script> na koncu index.html.

// HELP
const helpTabs={basic:['helpTabBasic','helpBasic'],advanced:['helpTabAdvanced','helpAdvanced'],glossary:['helpTabGlossary','helpGlossary'],eco:['helpTabEco','helpEco']};
function setHelpTab(tab){
  for(const key in helpTabs){
    const active=key===tab, [btnId,panelId]=helpTabs[key];
    $(btnId).classList.toggle('active',active); $(btnId).setAttribute('aria-selected',active?'true':'false');
    $(panelId).style.display=active?'':'none';
  }
}
$('helpTabBasic').addEventListener('click', ()=>setHelpTab('basic'));
$('helpTabAdvanced').addEventListener('click', ()=>setHelpTab('advanced'));
$('helpTabGlossary').addEventListener('click', ()=>setHelpTab('glossary'));
$('helpTabEco').addEventListener('click', ()=>setHelpTab('eco'));

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

// KEYBOARD
// Skroty klawiszowe milkna, gdy uzytkownik pisze. Wczesniej sprawdzany byl tylko
// tagName==='INPUT', wiec spacja w polu OPISU SCENY (textarea) zatrzymywala odtwarzanie
// zamiast wpisac odstep. Liczy sie kazde pole edytowalne, lacznie z contenteditable.
function pisze(t){
  if(!t) return false;
  const tag=t.tagName;
  return tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||t.isContentEditable;
}
// Nakladka na wierzchu przejmuje klawiature: bez tego Spacja czytana w tle uruchamiala
// dzwiek pod otwarta pomoca, a WASD chodzilo po niewidocznej scenie.
// nakladkaOtwarta() jest zadeklarowana raz, przy obsludze paska — druga deklaracja tej
// samej nazwy wygralaby po cichu przez hoisting.
document.addEventListener('keydown', e=>{ if(nakladkaOtwarta()) return; if(pisze(e.target)) return; S.keys[e.code]=true; if(e.code==='Space'){ e.preventDefault(); if(S.selectedSource){ S.selectedSource.playing?stopSource(S.selectedSource):playSource(S.selectedSource); } } });
document.addEventListener('keyup', e=>{ S.keys[e.code]=false; });

