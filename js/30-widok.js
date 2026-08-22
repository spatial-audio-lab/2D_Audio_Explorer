// 30-widok.js — Skalowanie obu plocien do DPR i przelacznik Edycja / Eksploracja.
// Czesc Sceny rozbitej na klasyczne skrypty. Kolejnosc ladowania jest kontraktem:
// patrz lista <script> na koncu index.html.

// CANVAS
function resizeCanvases(){
  const r=mainCanvas.parentElement.getBoundingClientRect(), dpr=devicePixelRatio||1;
  mainCanvas.width=r.width*dpr; mainCanvas.height=r.height*dpr;
  mainCanvas.style.width=r.width+'px'; mainCanvas.style.height=r.height+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
  minimapCanvas.width=120*dpr; minimapCanvas.height=120*dpr;
  minimapCtx.setTransform(dpr,0,0,dpr,0,0);
}
addEventListener('resize', resizeCanvases); resizeCanvases();

// MODE SWITCH
document.querySelectorAll('.mode-btn').forEach(b => {
  b.addEventListener('click', () => {
    S.mode=b.dataset.mode;
    document.querySelectorAll('.mode-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    app.classList.remove('edit-mode','explore-mode');
    app.classList.add(S.mode+'-mode');
    S.target=null;
  });
});

