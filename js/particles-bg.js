/*! particles-bg.js - fondo de particulas conectadas para las paginas sin menu (Photos).
 *  Mismo lenguaje que el menu principal (js/cubes-bg.js): puntos blancos con glow, lineas finas que se unen
 *  por cercania y algunos "atomos" con su orbita; pero mucho mas sutil (menos particulas, lineas tenues, sin cubos)
 *  para que no sature y el contenido siga siendo lo importante.
 *
 *  Canvas 2D transparente (deja ver el color de fondo de la pagina), sin dependencias.
 *  El cursor mueve las particulas un poco (parallax); se pausa con la pestana oculta; con "reducir movimiento"
 *  queda una imagen fija.
 *
 *  Uso: <canvas data-take-particles></canvas> + este script  (se monta solo), o window.TakeParticles.mount(canvas).
 *  Ajustes rapidos: COUNT, LINK, ALPHA aqui abajo.
 */
(() => {
  'use strict';
  if (window.TakeParticles) return;

  // ---- Ajustes ------------------------------------------------------------------------------------------------
  const COUNT = { desktop: 46, mobile: 26 };  // particulas (el menu usa 64 / 34)
  const LINK = 0.15;                          // distancia maxima de union, como fraccion del lado mayor de la pantalla
  const ALPHA = { line: 0.2, dot: 0.55, glow: 0.06 };   // intensidades maximas (el menu va bastante mas fuerte)
  const SPEED = 0.02;                         // velocidad de deriva

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  function rng(seed) {
    return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const mq = q => (window.matchMedia ? window.matchMedia(q) : { matches: false, addEventListener() {} });
  const rmq = mq('(prefers-reduced-motion: reduce)');
  const coarseq = mq('(hover: none), (pointer: coarse)');

  function mount(canvas, opts = {}) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return () => {};
    const R = rng(20261021);
    const N = coarseq.matches ? COUNT.mobile : COUNT.desktop;
    // x,y en 0..1 de la pantalla; z = profundidad (0 cerca, 1 lejos): cambia tamano, brillo y parallax
    const parts = Array.from({ length: N }, (_, i) => ({
      x: R(), y: R(), z: R(),
      vx: (R() - .5) * SPEED, vy: (R() - .5) * SPEED,
      nuc: i % 8 === 0, ph: R() * 6.28, tilt: R() * 3.14,
    }));
    const S = { W: 1, H: 1, dpr: 1, raf: 0, last: 0, t: 0, mx: 0, my: 0, px: 0, py: 0, dead: false, ready: false, ema: 16, low: false, slow: 0 };

    function resize() {
      S.dpr = Math.min(window.devicePixelRatio || 1, coarseq.matches ? 1.5 : 2);
      S.W = Math.max(1, canvas.clientWidth || window.innerWidth);
      S.H = Math.max(1, canvas.clientHeight || window.innerHeight);
      canvas.width = Math.round(S.W * S.dpr); canvas.height = Math.round(S.H * S.dpr);
      ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
      if (rmq.matches || !S.raf) draw();
    }

    function update(dt) {
      S.px = lerp(S.px, S.mx, 1 - Math.exp(-3 * dt)); S.py = lerp(S.py, S.my, 1 - Math.exp(-3 * dt));
      if (rmq.matches) return;
      for (const p of parts) {
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.x > 1.05) p.x = -0.05; else if (p.x < -0.05) p.x = 1.05;
        if (p.y > 1.05) p.y = -0.05; else if (p.y < -0.05) p.y = 1.05;
      }
    }

    function draw() {
      const { W, H } = S, t = S.t;
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, W, H);
      // el mismo velo de luz tenue del menu, mucho mas suave
      const g = ctx.createRadialGradient(W * 0.55, H * 0.4, 0, W * 0.55, H * 0.4, Math.max(W, H) * 0.7);
      g.addColorStop(0, 'rgba(255,255,255,0.03)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      const n = S.low ? Math.ceil(parts.length / 2) : parts.length;
      const pts = [];
      for (let i = 0; i < n; i++) {
        const p = parts[i], depth = 1 - p.z * 0.65;           // cerca = 1, lejos = .35
        pts.push([p.x * W + S.px * 16 * depth, p.y * H + S.py * 12 * depth, depth, p]);
      }
      const th = LINK * Math.max(W, H), th2 = th * th;
      ctx.lineWidth = 1;
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i][0] - pts[j][0], dy = pts[i][1] - pts[j][1], d2 = dx * dx + dy * dy;
        if (d2 < th2) {
          const a = Math.pow(1 - Math.sqrt(d2) / th, 1.4) * ALPHA.line * Math.min(pts[i][2], pts[j][2]) * 1.3;
          ctx.strokeStyle = `rgba(255,255,255,${a.toFixed(3)})`;
          ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[j][0], pts[j][1]); ctx.stroke();
        }
      }
      for (const [x, y, s, p] of pts) {
        const r = (p.nuc ? 2.1 : 1.25) * s * 1.2;
        ctx.fillStyle = `rgba(255,255,255,${(p.nuc ? ALPHA.glow * 1.8 : ALPHA.glow).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(x, y, r * 4.2, 0, 6.283); ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${(ALPHA.dot * (p.nuc ? 1.25 : 1) * (0.6 + 0.4 * s)).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
        if (p.nuc) {   // orbita fina con un electron
          const a = 8 * s + 4, ang = t * 0.7 + p.ph;
          ctx.strokeStyle = 'rgba(255,255,255,0.11)'; ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.ellipse(x, y, a * 1.9, a * 0.7, p.tilt, 0, 6.283); ctx.stroke();
          const ex = Math.cos(ang) * a * 1.9, ey = Math.sin(ang) * a * 0.7;
          ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath();
          ctx.arc(x + ex * Math.cos(p.tilt) - ey * Math.sin(p.tilt), y + ex * Math.sin(p.tilt) + ey * Math.cos(p.tilt), 1 * s + .35, 0, 6.283); ctx.fill();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    function frame(now) {
      if (S.dead) return;
      const dt = Math.min(0.05, (now - (S.last || now)) / 1000); S.last = now; S.t += dt;
      S.ema = lerp(S.ema, dt * 1000, 0.05);   // si va justo, baja a la mitad de particulas
      if (!S.low && S.ema > 30 && ++S.slow > 90) S.low = true; else if (S.ema <= 30) S.slow = 0;
      update(dt); draw();
      if (!S.ready) { S.ready = true; opts.onReady && opts.onReady(); }
      S.raf = rmq.matches || document.hidden ? 0 : requestAnimationFrame(frame);
    }

    const wake = () => { if (!S.raf && !S.dead && !document.hidden && !rmq.matches) { S.last = 0; S.raf = requestAnimationFrame(frame); } };
    const onMove = ev => { S.mx = clamp((ev.clientX / S.W - 0.5) * 2, -1, 1); S.my = clamp((ev.clientY / S.H - 0.5) * 2, -1, 1); wake(); };
    const onLeave = () => { S.mx = 0; S.my = 0; };
    const onVis = () => { if (document.hidden) { cancelAnimationFrame(S.raf); S.raf = 0; } else wake(); };
    const onRm = () => { cancelAnimationFrame(S.raf); S.raf = 0; resize(); wake(); };
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', onLeave);
    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', onVis);
    rmq.addEventListener && rmq.addEventListener('change', onRm);

    resize();
    if (rmq.matches) { draw(); S.ready = true; opts.onReady && opts.onReady(); } else S.raf = requestAnimationFrame(frame);

    canvas.__takeParticles = S;   // ayuda para pruebas
    return function dispose() {
      S.dead = true; cancelAnimationFrame(S.raf); S.raf = 0;
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
      rmq.removeEventListener && rmq.removeEventListener('change', onRm);
      delete canvas.__takeParticles;
    };
  }

  window.TakeParticles = { version: '1.0.0', mount };
  const auto = () => { const c = document.querySelector('canvas[data-take-particles]'); if (c) mount(c); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto();
})();
