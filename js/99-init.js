// 99-init.js — Start aplikacji i dwa drobiazgi paska. MUSI byc ostatni — wywoluje
// funkcje zadeklarowane we wszystkich poprzednich plikach.
// Czesc Sceny rozbitej na klasyczne skrypty. Kolejnosc ladowania jest kontraktem:
// patrz lista <script> na koncu index.html.

// INIT
// Biblioteka NIE laduje sie przy starcie — panel jest zwiniety, a library.json pobiera
// sie dopiero przy pierwszym otwarciu (patrz ustawBiblioteke w 40-biblioteka.js).
updateListener();
requestAnimationFrame(loop);
// --- par.08 v3.1: stan dzwieku niesie DIODA, nie napis --------------------------------
// Do v3.0 pasek pokazywal "Audio Context: Idle/Running". Wzorzec v3.1 tego napisu nie ma:
// dioda pulsuje i rozchodzi sie pierscieniem, gdy dzwiek gra, a przycisk transportu i tak
// mowi to slowami. Trzeci raz ta sama informacja tylko zabierala miejsce nazwie apki.
(function(){
  var bar = document.getElementById('salBar');
  var dot = document.getElementById('salStatusDot');
  if(!bar || !dot) return;
  function refresh(){
    var gra = audioCtx.state === 'running' && S.sources.some(function(z){ return z.playing; });
    dot.classList.toggle('is-playing', gra);
    bar.classList.toggle('is-playing', gra);
  }
  audioCtx.addEventListener('statechange', refresh);
  setInterval(refresh, 300);
  refresh();
})();
// --- SAL Manifest par.12: zamkniecie ostrzezenia o sluchawkach ---
(function(){
  var w = document.getElementById('hpWarn'), b = document.getElementById('hpWarnClose');
  if(w && b) b.addEventListener('click', function(){ w.classList.add('hidden'); });
})();

