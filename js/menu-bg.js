/*! menu-bg.js - fondo del menu principal: filamentos de luz + motas de luz (bokeh) sobre el fondo liquido.
 *  Canvas 2D transparente, sin dependencias. Sustituye a los cubos 3D y las particulas conectadas.
 *
 *  1. FILAMENTOS: hilos finos de luz cian que siguen un campo de flujo que cambia muy despacio, asi que ondulan y se
 *     deforman como las lineas del GIF de fondo. Cada hilo lleva una chispa que lo recorre.
 *  2. MOTAS: discos de luz suaves (algunos con anillo, como el bokeh de una foto) que suben lentamente con un vaiven;
 *     cerca = nitidas y pequenas, lejos = grandes y difusas. El cursor las aparta un poco y vuelven solas.
 *
 *  - El cursor/dedo mueve todo un poco segun la profundidad (parallax).
 *  - Una sola rueda de requestAnimationFrame; se pausa con la pestana oculta; prefers-reduced-motion = imagen fija.
 *  - Si el equipo va justo, baja a la mitad de hilos y motas.
 *  - Detras va la capa .menu-liquid (images/menu-bg.webp, animada); por eso este canvas es transparente.
 *
 *  Uso:  const dispose = window.TakeMenuBg.mount(canvas, { onReady });   dispose() para quitarlo.
 *  Ajustes rapidos: FILAMENTS, MOTES, STEPS, COLOR y ALPHA aqui abajo.
 *  TKWM-40632a5f-41f0-9fe6-22f804d522ac
 */
(() => {
  'use strict';
  if (window.TakeMenuBg) return;

  // ---- Ajustes -----------------------------------------------------------------------------------------------
  const FILAMENTS = { desktop: 16, mobile: 10 };     // hilos de luz
  const STEPS = { desktop: 30, mobile: 24 };        // largo de cada hilo (pasos hacia delante y hacia atras)
  const MOTES = { desktop: 40, mobile: 24 };        // motas de luz
  const COLOR = { thread: '126,222,238', mote: '214,240,255' };   // r,g,b: cian hielo de los hilos / blanco azulado de las motas
  const ALPHA = { thread: 0.42, mote: 0.5 };        // intensidades maximas

  // ---- Utilidades ---------------------------------------------------------------------------------------------
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  function rng(seed) {
    return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const mq = q => (window.matchMedia ? window.matchMedia(q) : { matches: false, addEventListener() {} });
  const rmq = mq('(prefers-reduced-motion: reduce)');
  const coarseq = mq('(hover: none), (pointer: coarse)');

  /** Campo de flujo: direccion (en radianes) en el punto x,y (unidades de pantalla) y el instante t. Cambia muy despacio. */
  function flow(x, y, t) {
    return Math.sin(x * 3.4 + t * 0.08) * 1.5 + Math.sin(y * 4.1 - t * 0.06 + 1.7) * 1.3 + Math.sin((x - y) * 2.6 + t * 0.045 + 4.1) * 0.9;
  }

  function mount(canvas, opts = {}) {
    // Fondo liquido (images/menu-bg.webp, animado) como capa CSS DETRAS del canvas: por eso el canvas es transparente.
    // Con "reducir movimiento" no se pone y el canvas vuelve a pintar su fondo negro de siempre.
    const useLiquid = opts.liquid !== false && !rmq.matches && !!canvas.parentNode;
    const ctx = canvas.getContext('2d', { alpha: useLiquid });
    if (!ctx) return () => {};
    let liquid = null;
    if (useLiquid) {
      liquid = document.createElement('div');
      liquid.className = 'menu-liquid';
      liquid.setAttribute('aria-hidden', 'true');
      canvas.parentNode.insertBefore(liquid, canvas);
      const im = new Image();   // se precarga para que aparezca con fundido, sin saltos
      im.onload = () => { if (liquid) liquid.classList.add('is-on'); };
      im.src = '/images/menu-bg.webp';
    }

    const R = rng(20261022);
    const coarse = coarseq.matches;
    const S = { W: 0, H: 0, dpr: 1, U: 1, raf: 0, last: 0, t: 0, ema: 16, slow: 0, low: false,
                mx: 0, my: 0, px: 0, py: 0, active: false, mx_px: -9999, my_px: -9999, ready: false, dead: false };

    // hilos: semilla en pantalla (0..1) + profundidad; la forma sale del campo de flujo
    const NF = coarse ? FILAMENTS.mobile : FILAMENTS.desktop, NS = coarse ? STEPS.mobile : STEPS.desktop;
    const threads = Array.from({ length: NF }, () => ({
      sx: R() * 1.1 - 0.05, sy: R() * 1.1 - 0.05, z: R(),
      d1: 0.05 + R() * 0.06, d2: 0.04 + R() * 0.06, ph: R() * 6.28,
      bead: R(), bs: 0.03 + R() * 0.04,   // chispa: posicion 0..1 y velocidad
    }));
    const pts = new Float32Array((NS * 2 + 1) * 2);

    // motas: x,y en -1..1; z = profundidad (0 cerca, 1 lejos)
    const NM = coarse ? MOTES.mobile : MOTES.desktop;
    const motes = Array.from({ length: NM }, () => {
      const z = R();
      return { nx: R() * 2.3 - 1.15, ny: R() * 2.3 - 1.15, z,
        r: 2 + (1 - z) * 4 + z * 8 + R() * 6 + (R() < 0.18 ? 10 : 0),   // radio en px (las lejanas, mayores y difusas)
        v: 0.006 + R() * 0.014, sw: 0.2 + R() * 0.35, amp: 6 + R() * 16, ph: R() * 6.28, fr: 0.5 + R() * 1.2,
        ox: 0, oy: 0, vx: 0, vy: 0 };
    });

    function resize() {
      const dprMax = coarse ? 1.5 : 2;
      S.dpr = Math.min(window.devicePixelRatio || 1, dprMax);
      S.W = Math.max(1, canvas.clientWidth || window.innerWidth);
      S.H = Math.max(1, canvas.clientHeight || window.innerHeight);
      S.U = Math.max(S.W, S.H);
      canvas.width = Math.round(S.W * S.dpr); canvas.height = Math.round(S.H * S.dpr);
      ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
      if (rmq.matches || !S.raf) draw();
    }

    function update(dt) {
      const still = rmq.matches;
      // el cursor se suaviza; sin cursor (movil) solo queda el movimiento propio
      S.px = lerp(S.px, S.mx, 1 - Math.exp(-3 * dt)); S.py = lerp(S.py, S.my, 1 - Math.exp(-3 * dt));
      if (still) return;
      for (const m of motes) {
        m.ny -= m.v * dt;                                   // suben despacio
        if (m.ny < -1.15) { m.ny = 1.15; m.nx = R() * 2.3 - 1.15; m.ox = m.oy = m.vx = m.vy = 0; }
        if (S.active) {                                     // el cursor las aparta un poco y vuelven (resorte)
          const x = (m.nx * 0.5 + 0.5) * S.W + m.ox, y = (m.ny * 0.5 + 0.5) * S.H + m.oy;
          const dx = x - S.mx_px, dy = y - S.my_px, d = Math.hypot(dx, dy), rr = S.U * 0.09 + m.r * 2;
          if (d < rr && d > 1) { const f = (1 - d / rr) * 140; m.vx += (dx / d) * f * dt; m.vy += (dy / d) * f * dt; }
        }
        m.vx += -m.ox * 5 * dt; m.vy += -m.oy * 5 * dt; m.vx *= Math.exp(-4 * dt); m.vy *= Math.exp(-4 * dt);
        m.ox += m.vx * dt; m.oy += m.vy * dt;
      }
    }

    function drawThread(f, t, par) {
      const { W, H, U } = S, depth = 1 - f.z * 0.55;       // cerca = 1, lejos = .45
      const h = U * 0.0105 * (0.8 + f.z * 0.45);           // largo de cada paso
      const sway = U * 0.03;
      const x0 = f.sx * W + Math.sin(t * f.d1 + f.ph) * sway + S.px * 26 * depth * par;
      const y0 = f.sy * H + Math.cos(t * f.d2 + f.ph) * sway + S.py * 20 * depth * par;
      // se traza el hilo desde la semilla hacia atras y hacia delante siguiendo el campo de flujo
      const c = NS;                                         // indice de la semilla en el arreglo
      pts[c * 2] = x0; pts[c * 2 + 1] = y0;
      for (let dir = -1; dir <= 1; dir += 2) {
        let x = x0, y = y0;
        for (let i = 1; i <= NS; i++) {
          const a = flow(x / U, y / U, t) + (dir < 0 ? Math.PI : 0);
          x += Math.cos(a) * h; y += Math.sin(a) * h;
          pts[(c + dir * i) * 2] = x; pts[(c + dir * i) * 2 + 1] = y;
        }
      }
      const n = NS * 2 + 1;
      // envolvente: el hilo nace y muere suavemente en sus puntas. Se dibuja en tramos (un trazo por tramo, no por segmento)
      const CH = 12;
      for (let pass = 0; pass < 2; pass++) {
        ctx.lineWidth = pass ? 1.1 : 4.6;
        const k = (pass ? 1 : 0.17) * ALPHA.thread * (0.45 + 0.55 * depth);
        for (let c2 = 0; c2 < CH; c2++) {
          const i0 = Math.floor(c2 * (n - 1) / CH), i1 = Math.floor((c2 + 1) * (n - 1) / CH);
          const e = Math.pow(Math.sin(Math.PI * ((c2 + 0.5) / CH)), 1.3);
          ctx.strokeStyle = `rgba(${COLOR.thread},${(k * e).toFixed(3)})`;
          ctx.beginPath(); ctx.moveTo(pts[i0 * 2], pts[i0 * 2 + 1]);
          for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(pts[i * 2], pts[i * 2 + 1]);
          ctx.stroke();
        }
      }
      // chispa que recorre el hilo
      const bi = Math.floor(((f.bead + t * f.bs) % 1) * (n - 1)), bx = pts[bi * 2], by = pts[bi * 2 + 1];
      const e = Math.pow(Math.sin(Math.PI * (bi + 0.5) / (n - 1)), 1.3), br = 7 * depth + 3;
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      g.addColorStop(0, `rgba(255,255,255,${(0.85 * e).toFixed(3)})`); g.addColorStop(0.35, `rgba(${COLOR.thread},${(0.35 * e).toFixed(3)})`); g.addColorStop(1, `rgba(${COLOR.thread},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, by, br, 0, 6.283); ctx.fill();
    }

    function drawMote(m, t, par) {
      const { W, H } = S, depth = 1 - m.z * 0.65;
      const k = W < 600 ? 0.75 : 1;
      const x = (m.nx * 0.5 + 0.5) * W + m.ox + Math.sin(t * m.sw + m.ph) * m.amp + S.px * 30 * depth * par;
      const y = (m.ny * 0.5 + 0.5) * H + m.oy + S.py * 22 * depth * par;
      const r = m.r * k, tw = 0.78 + 0.22 * Math.sin(t * m.fr + m.ph);
      // las lejanas son mas grandes y mas tenues (difusas); las cercanas, pequenas y nitidas
      const a = ALPHA.mote * tw * (0.35 + 0.65 * depth) * (r > 12 ? 0.5 : 1);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${COLOR.mote},${a.toFixed(3)})`); g.addColorStop(0.5, `rgba(${COLOR.mote},${(a * 0.4).toFixed(3)})`); g.addColorStop(1, `rgba(${COLOR.mote},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
      if (r > 10) {   // anillo de bokeh
        ctx.strokeStyle = `rgba(${COLOR.mote},${(a * 0.45).toFixed(3)})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x, y, r * 0.86, 0, 6.283); ctx.stroke();
      }
    }

    function draw() {
      const { W, H } = S, t = S.t;
      ctx.globalCompositeOperation = 'source-over';
      if (liquid) ctx.clearRect(0, 0, W, H); else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'butt'; ctx.lineJoin = 'round';   // butt: los tramos del hilo no suman puntos brillantes en las uniones
      const par = rmq.matches ? 0 : 1;
      const nt = S.low ? Math.ceil(threads.length / 2) : threads.length, nm = S.low ? Math.ceil(motes.length / 2) : motes.length;
      for (let i = 0; i < nt; i++) drawThread(threads[i], t, par);
      for (let i = 0; i < nm; i++) drawMote(motes[i], t, par);
      ctx.globalCompositeOperation = 'source-over';
    }

    function frame(now) {
      if (S.dead) return;
      const dt = Math.min(0.05, (now - (S.last || now)) / 1000); S.last = now; S.t += dt;
      // si va justo: la mitad de hilos y motas
      S.ema = lerp(S.ema, dt * 1000, 0.05);
      if (!S.low && S.ema > 30 && ++S.slow > 90) S.low = true; else if (S.ema <= 30) S.slow = 0;
      update(dt); draw();
      if (!S.ready) { S.ready = true; opts.onReady && opts.onReady(); }
      S.raf = rmq.matches || document.hidden ? 0 : requestAnimationFrame(frame);
    }

    // ---- eventos ---------------------------------------------------------------------------------------------
    const wake = () => { if (!S.raf && !S.dead && !document.hidden && !rmq.matches) { S.last = 0; S.raf = requestAnimationFrame(frame); } };
    const onMove = ev => {
      const x = ev.clientX, y = ev.clientY;
      S.mx_px = x; S.my_px = y; S.mx = (x / S.W - 0.5) * 2; S.my = (y / S.H - 0.5) * 2; S.active = true;
      wake();
    };
    const onLeave = () => { S.active = false; S.mx = 0; S.my = 0; S.mx_px = S.my_px = -9999; };
    const onVis = () => { if (document.hidden) { cancelAnimationFrame(S.raf); S.raf = 0; } else wake(); };
    const onRm = () => { cancelAnimationFrame(S.raf); S.raf = 0; resize(); wake(); };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerleave', onLeave); document.documentElement.addEventListener('mouseleave', onLeave);
    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', onVis);
    rmq.addEventListener && rmq.addEventListener('change', onRm);

    resize();
    if (rmq.matches) { draw(); S.ready = true; opts.onReady && opts.onReady(); } else S.raf = requestAnimationFrame(frame);

    // ayudas para pruebas / depuracion
    canvas.__takeMenuBg = S;
    return function dispose() {
      S.dead = true; cancelAnimationFrame(S.raf); S.raf = 0;
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerleave', onLeave);
      document.documentElement.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', onVis);
      rmq.removeEventListener && rmq.removeEventListener('change', onRm);
      delete canvas.__takeMenuBg;
      if (liquid) { liquid.remove(); liquid = null; }
    };
  }

  window.TakeMenuBg = { version: '2.0.0', mount };
  window.dispatchEvent(new Event('take-menubg-ready'));
})();
