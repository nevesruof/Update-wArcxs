/*! admin-particles.js - fondo de particulas que se conectan (red de constelacion) de la pagina /admin. Canvas 2D, sin dependencias.
 *
 *  - Las particulas flotan despacio; las que estan cerca se unen con lineas que se desvanecen con la distancia.
 *  - El cursor / dedo atrae suavemente las particulas cercanas y se une a ellas con lineas.
 *  - Una sola rueda de requestAnimationFrame; se pausa con la pestana oculta; prefers-reduced-motion = imagen fija.
 *  - Si el equipo va justo, baja la cantidad de particulas una vez.
 *
 *  Uso:  const dispose = window.TakeAdminParticles.mount(canvas);   dispose() para quitarlo.
 *  Ajustes rapidos: DENSITY, MAX_COUNT, LINK, SPEED y COLOR aqui abajo.
 *  TKWM-40632a5f-41f0-9fe6-22f804d522ac
 */
(() => {
  'use strict';
  if (window.TakeAdminParticles) return;

  // ---- Ajustes ---------------------------------------------------------------------------------------------
  const DENSITY = 1 / 13000;          // particulas por pixel cuadrado (CSS)
  const MIN_COUNT = 36, MAX_COUNT = 110;
  const LINK = 0.16;                  // distancia maxima de union, como fraccion del lado mayor de la pantalla (max. 170 px)
  const SPEED = 14;                   // velocidad media en px/s
  const POINTER_RADIUS = 150;         // alcance del cursor en px
  const COLOR = '176, 208, 255';      // r, g, b de las lineas y las particulas

  // ---- Utilidades ------------------------------------------------------------------------------------------
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const mq = (q) => (window.matchMedia ? window.matchMedia(q) : { matches: false });
  const reduced = mq('(prefers-reduced-motion: reduce)');
  const coarse = mq('(hover: none), (pointer: coarse)');

  function glowSprite() {            // halo suave precalculado: dibujarlo es mucho mas barato que shadowBlur
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(' + COLOR + ', 0.55)');
    grad.addColorStop(0.35, 'rgba(' + COLOR + ', 0.14)');
    grad.addColorStop(1, 'rgba(' + COLOR + ', 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return c;
  }

  function mount(canvas, opts = {}) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return () => {};
    const sprite = glowSprite();
    const S = { W: 0, H: 0, dpr: 1, link: 120, raf: 0, last: 0, ema: 16, slow: 0, shrunk: false, parts: [], px: -1e4, py: -1e4, hasPointer: false };

    function seed(count) {
      const prev = S.parts;
      S.parts = Array.from({ length: count }, (_, i) => {
        if (prev[i]) return prev[i];
        const z = 0.35 + Math.random() * 0.65;               // profundidad: lo lejano es mas chico, tenue y lento
        const a = Math.random() * Math.PI * 2;
        return { x: Math.random() * S.W, y: Math.random() * S.H, z, a, vx: Math.cos(a) * SPEED * z, vy: Math.sin(a) * SPEED * z,
                 r: 0.8 + z * 1.5, tw: Math.random() * Math.PI * 2 };
      });
    }
    function targetCount() {
      let n = clamp(Math.round(S.W * S.H * DENSITY), MIN_COUNT, MAX_COUNT);
      if (coarse.matches) n = Math.round(n * 0.7);
      return S.shrunk ? Math.round(n * 0.65) : n;
    }
    function resize() {
      const r = canvas.getBoundingClientRect();
      const oldW = S.W, oldH = S.H;
      S.W = Math.max(1, r.width); S.H = Math.max(1, r.height);
      S.dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(S.W * S.dpr); canvas.height = Math.round(S.H * S.dpr);
      ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
      S.link = Math.min(170, Math.max(S.W, S.H) * LINK);
      if (oldW > 1) for (const p of S.parts) { p.x *= S.W / oldW; p.y *= S.H / oldH; }   // conserva la distribucion al girar el telefono
      seed(targetCount());
      if (reduced.matches) draw(0);
    }

    function step(dt) {
      const m = 20;
      for (const p of S.parts) {
        p.a += (Math.random() - 0.5) * 0.9 * dt;              // la direccion cambia muy poco a poco
        const sp = SPEED * p.z;
        p.vx += (Math.cos(p.a) * sp - p.vx) * Math.min(1, dt * 0.8);
        p.vy += (Math.sin(p.a) * sp - p.vy) * Math.min(1, dt * 0.8);
        if (S.hasPointer) {
          const dx = S.px - p.x, dy = S.py - p.y, d = Math.hypot(dx, dy);
          if (d < POINTER_RADIUS && d > 1) { const f = (1 - d / POINTER_RADIUS) * 38 * p.z; p.vx += (dx / d) * f * dt * 3; p.vy += (dy / d) * f * dt * 3; }
        }
        p.x += p.vx * dt; p.y += p.vy * dt; p.tw += dt * 1.4;
        if (p.x < -m) p.x = S.W + m; else if (p.x > S.W + m) p.x = -m;
        if (p.y < -m) p.y = S.H + m; else if (p.y > S.H + m) p.y = -m;
      }
    }

    function draw() {
      ctx.clearRect(0, 0, S.W, S.H);
      const P = S.parts, n = P.length, L = S.link, L2 = L * L;
      ctx.lineWidth = 1;
      for (let i = 0; i < n; i++) {                           // lineas entre particulas cercanas
        const a = P[i];
        for (let j = i + 1; j < n; j++) {
          const b = P[j], dx = a.x - b.x;
          if (dx > L || dx < -L) continue;
          const dy = a.y - b.y, d2 = dx * dx + dy * dy;
          if (d2 > L2) continue;
          const k = 1 - Math.sqrt(d2) / L;
          ctx.strokeStyle = 'rgba(' + COLOR + ',' + (k * k * 0.42 * Math.min(a.z, b.z) + 0.02).toFixed(3) + ')';
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
      if (S.hasPointer) {                                     // lineas hacia el cursor
        const R = L * 1.25;
        for (const p of P) {
          const d = Math.hypot(p.x - S.px, p.y - S.py);
          if (d > R) continue;
          ctx.strokeStyle = 'rgba(' + COLOR + ',' + ((1 - d / R) * 0.55).toFixed(3) + ')';
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(S.px, S.py); ctx.stroke();
        }
      }
      for (const p of P) {                                    // particulas con halo
        const tw = 0.75 + 0.25 * Math.sin(p.tw), s = p.r * 7;
        ctx.globalAlpha = clamp(p.z * tw, 0, 1) * 0.9;
        ctx.drawImage(sprite, p.x - s, p.y - s, s * 2, s * 2);
        ctx.globalAlpha = clamp(0.45 + p.z * 0.5, 0, 1) * tw;
        ctx.fillStyle = 'rgb(' + COLOR + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function frame(t) {
      S.raf = 0;
      const dt = Math.min(0.05, (t - (S.last || t)) / 1000);
      S.last = t;
      if (dt > 0) {
        S.ema += (dt * 1000 - S.ema) * 0.05;
        S.slow = S.ema > 26 ? S.slow + dt : Math.max(0, S.slow - dt);
        if (S.slow > 2 && !S.shrunk) { S.shrunk = true; seed(targetCount()); S.parts.length = targetCount(); }   // equipo justo: menos particulas
      }
      step(dt); draw();
      schedule();
    }
    function schedule() { if (!S.raf && !reduced.matches && !document.hidden) S.raf = requestAnimationFrame(frame); }
    function onVisibility() { if (document.hidden) { cancelAnimationFrame(S.raf); S.raf = 0; } else { S.last = 0; schedule(); } }

    function onMove(e) { S.px = e.clientX; S.py = e.clientY; S.hasPointer = true; }
    function onLeave() { S.hasPointer = false; }
    let rt = 0;
    function onResize() { clearTimeout(rt); rt = setTimeout(resize, 120); }

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onMove, { passive: true });
    window.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') onLeave(); }, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    reduced.addEventListener && reduced.addEventListener('change', () => { if (reduced.matches) { cancelAnimationFrame(S.raf); S.raf = 0; draw(); } else schedule(); });

    resize();
    if (!reduced.matches) schedule();
    if (opts.onReady) opts.onReady();

    return function dispose() {
      cancelAnimationFrame(S.raf); S.raf = 0; clearTimeout(rt);
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerdown', onMove);
      document.removeEventListener('pointerleave', onLeave); window.removeEventListener('blur', onLeave);
      window.removeEventListener('resize', onResize); document.removeEventListener('visibilitychange', onVisibility);
    };
  }

  window.TakeAdminParticles = { mount };
})();
