/* TKWM-40632a5f-41f0-9fe6-22f804d522ac */
(() => {
  'use strict';
  if (window.TakeDepth) return;

  const mq = q => (window.matchMedia ? window.matchMedia(q) : { matches: false, addEventListener() {} });
  const reduced = mq('(prefers-reduced-motion: reduce)');
  const finePointer = mq('(hover: hover) and (pointer: fine)');
  const root = document.documentElement;

  const weak = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) ||
    (navigator.deviceMemory && navigator.deviceMemory <= 2);
  if (weak) root.classList.add('td-lite');

  const MARKUP =
    '<div class="td-aurora"><i></i><i></i><i></i></div>' +
    '<div class="td-grid"></div>' +
    '<div class="td-halo"></div>' +
    '<div class="td-scrim"></div>' +
    '<div class="td-vignette"></div>' +
    '<div class="td-spot"></div>' +
    '<div class="td-frame"><span></span><span></span><span></span><span></span></div>';

  let layer = null;

  function build() {
    if (layer) return;
    const el = document.createElement('div');
    el.className = 'take-depth';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = MARKUP;
    document.body.appendChild(el);
    layer = el;
    if (!reduced.matches && finePointer.matches) follow(el);
    window.TakeDepth = { el };
    // si React rehidrata el <body> (pasa cuando el HTML y el cliente no coinciden) la capa se vuelve a poner sola
    new MutationObserver(() => { if (!layer.isConnected) document.body.appendChild(layer); })
      .observe(document.body, { childList: true });
  }

  function follow(el) {
    const aurora = el.querySelector('.td-aurora');
    const grid = el.querySelector('.td-grid');
    const spot = el.querySelector('.td-spot');

    let tx = 0.5, ty = 0.5, cx = 0.5, cy = 0.5;
    let sx = innerWidth * 0.5, sy = innerHeight * 0.5, stx = sx, sty = sy;
    let raf = 0;

    function frame() {
      raf = 0;
      cx += (tx - cx) * 0.06; cy += (ty - cy) * 0.06;
      sx += (stx - sx) * 0.14; sy += (sty - sy) * 0.14;
      aurora.style.transform = 'translate3d(' + ((0.5 - cx) * 38).toFixed(2) + 'px,' + ((0.5 - cy) * 26).toFixed(2) + 'px,0)';
      grid.style.transform = 'translate3d(' + ((0.5 - cx) * 16).toFixed(2) + 'px,' + ((0.5 - cy) * 11).toFixed(2) + 'px,0)';
      spot.style.transform = 'translate3d(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px,0)';
      const settled = Math.abs(tx - cx) < 0.0006 && Math.abs(ty - cy) < 0.0006 &&
        Math.abs(stx - sx) < 0.3 && Math.abs(sty - sy) < 0.3;
      if (!settled && !document.hidden) raf = requestAnimationFrame(frame);
    }
    const kick = () => { if (!raf && !document.hidden) raf = requestAnimationFrame(frame); };

    addEventListener('pointermove', e => {
      if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      tx = e.clientX / innerWidth; ty = e.clientY / innerHeight;
      stx = e.clientX; sty = e.clientY;
      if (!spot.classList.contains('is-on')) {
        sx = stx; sy = sty;
        spot.classList.add('is-on');
      }
      kick();
    }, { passive: true });
    root.addEventListener('pointerleave', () => spot.classList.remove('is-on'));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
    addEventListener('blur', () => spot.classList.remove('is-on'));
  }

  // espera a que la app termine de hidratar (window.__takeReady); si no llega, arranca igual a los 6 s
  function start() {
    const t0 = Date.now();
    (function wait() {
      if (window.__takeReady || Date.now() - t0 > 6000 || !document.querySelector('#home')) build();
      else setTimeout(wait, 120);
    })();
  }
  if (document.readyState === 'complete') start();
  else addEventListener('load', start, { once: true });
})();
