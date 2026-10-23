/*! menu-bg.js - fondo del menu principal: filamentos de luz + motas de luz (bokeh) sobre el fondo liquido.
 *  Canvas 2D transparente, sin dependencias.
 *
 *  1. FILAMENTOS: hilos finos de luz cian que siguen un campo de flujo que cambia muy despacio, asi que ondulan y se
 *     deforman como las lineas del fondo liquido. Cada hilo lleva una chispa que lo recorre.
 *  2. MOTAS: discos de luz suaves (algunos con anillo, como el bokeh de una foto) que suben lentamente con un vaiven;
 *     cerca = nitidas y pequenas, lejos = grandes y difusas. El cursor las aparta un poco y vuelven solas.
 *  3. FONDO LIQUIDO: <video> en bucle (images/menu-bg.mp4 / .webm) detras del canvas, en la capa .menu-liquid.
 *
 *  Optimizado para que no se sienta pesado (sobre todo en celular):
 *   - Dibuja a 30 fps (el movimiento es lento; mas fps no se nota y cuesta el doble). Con un panel abierto, a 15.
 *   - Resolucion de dibujo adaptable: parte de 1x (celular) / 1.25x (PC) y baja sola si el equipo va justo;
 *     si aun asi va justo, baja a la mitad de hilos y motas.
 *   - Motas y chispas son sprites pre-dibujados (drawImage) en lugar de un degradado nuevo por frame.
 *   - Cada hilo es UN trazo con degradado a lo largo (no un trazo por tramo).
 *   - El video decodifica por hardware; se pausa con un panel abierto o la pestana oculta. Si el navegador bloquea el
 *     autoplay (ahorro de bateria), queda el poster estatico y arranca con el primer toque.
 *   - Una sola rueda de requestAnimationFrame; se pausa con la pestana oculta; prefers-reduced-motion = imagen fija.
 *
 *  Uso:  const dispose = window.TakeMenuBg.mount(canvas, { onReady });   dispose() para quitarlo.
 *  Ajustes rapidos: FILAMENTS, MOTES, STEPS, COLOR, ALPHA y FPS aqui abajo.
 *  TKWM-40632a5f-41f0-9fe6-22f804d522ac
 */
(() => {
  'use strict';
  if (window.TakeMenuBg) return;

  // ---- Ajustes -----------------------------------------------------------------------------------------------
  const FILAMENTS = { desktop: 12, mobile: 7 };     // hilos de luz
  const STEPS = { desktop: 28, mobile: 22 };        // largo de cada hilo (pasos hacia delante y hacia atras)
  const MOTES = { desktop: 30, mobile: 16 };        // motas de luz
  const COLOR = { thread: '126,222,238', mote: '214,240,255' };   // r,g,b: cian hielo de los hilos / blanco azulado de las motas
  const ALPHA = { thread: 0.42, mote: 0.5 };        // intensidades maximas
  const FPS = { normal: 30, panel: 15 };            // fps de dibujo (menu abierto / con un panel encima)
  const SCALE = { desktop: 1.25, mobile: 1, min: 0.6 };   // resolucion de dibujo (x pixeles CSS); baja sola si va justo

  // ---- Utilidades ---------------------------------------------------------------------------------------------
  const lerp = (a, b, t) => a + (b - a) * t;
  function rng(seed) {
    return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const mq = q => (window.matchMedia ? window.matchMedia(q) : { matches: false, addEventListener() {} });
  const rmq = mq('(prefers-reduced-motion: reduce)');
  const coarseq = mq('(hover: none), (pointer: coarse)');
  const now = () => (window.performance && performance.now ? performance.now() : Date.now());

  /** Campo de flujo: direccion (en radianes) en el punto x,y (unidades de pantalla) y el instante t. Cambia muy despacio. */
  function flow(x, y, t) {
    return Math.sin(x * 3.4 + t * 0.08) * 1.5 + Math.sin(y * 4.1 - t * 0.06 + 1.7) * 1.3 + Math.sin((x - y) * 2.6 + t * 0.045 + 4.1) * 0.9;
  }

  /** Sprite en un canvas pequeno: se dibuja una vez y luego solo se estampa con drawImage. */
  function sprite(size, paint) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    paint(c.getContext('2d'), size / 2); return c;
  }
  function discSprite(rgb, ring) {
    return sprite(64, (g, h) => {
      const gr = g.createRadialGradient(h, h, 0, h, h, h);
      gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(0.5, `rgba(${rgb},0.4)`); gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      if (ring) { g.strokeStyle = `rgba(${rgb},0.45)`; g.lineWidth = 1.4; g.beginPath(); g.arc(h, h, h * 0.86, 0, 6.283); g.stroke(); }
    });
  }
  function sparkSprite(rgb) {
    return sprite(64, (g, h) => {
      const gr = g.createRadialGradient(h, h, 0, h, h, h);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, `rgba(${rgb},0.4)`); gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    });
  }

  /** Capa de fondo liquido: <video> en bucle (hardware) con poster estatico. Devuelve { el, setPlaying, dispose }. */
  function makeLiquid(parent, before) {
    const el = document.createElement('div');
    el.className = 'menu-liquid';
    el.setAttribute('aria-hidden', 'true');
    const v = document.createElement('video');
    v.muted = true; v.defaultMuted = true; v.loop = true; v.autoplay = true; v.playsInline = true; v.preload = 'auto';
    v.disablePictureInPicture = true; v.tabIndex = -1;
    ['muted', 'playsinline', 'webkit-playsinline', 'loop', 'autoplay'].forEach(a => v.setAttribute(a, ''));
    v.poster = '/images/menu-bg-poster.webp';
    [['/images/menu-bg.mp4', 'video/mp4'], ['/images/menu-bg.webm', 'video/webm']].forEach(([src, type]) => {
      const s = document.createElement('source'); s.src = src; s.type = type; v.appendChild(s);
    });
    el.appendChild(v);
    parent.insertBefore(el, before);

    let want = true, disposed = false, unlock = null;
    const show = () => el.classList.add('is-on');
    v.addEventListener('loadeddata', show, { once: true });
    v.addEventListener('canplay', show, { once: true });
    // ningun formato de video funciona: el webp animado de siempre
    v.lastChild.addEventListener('error', () => {
      if (disposed || el.querySelector('img')) return;
      const im = document.createElement('img'); im.alt = ''; im.decoding = 'async'; im.src = '/images/menu-bg.webp';
      im.onload = show; v.remove(); el.insertBefore(im, el.firstChild);
    });
    function play() {
      if (!want || disposed || document.hidden) return;
      const p = v.play && v.play();
      if (p && p.catch) p.catch(() => {   // autoplay bloqueado: queda el poster y se reintenta con el primer toque
        if (unlock) return;
        unlock = () => { window.removeEventListener('pointerdown', unlock, true); unlock = null; play(); };
        window.addEventListener('pointerdown', unlock, { capture: true, once: true, passive: true });
      });
    }
    play();
    return {
      el,
      setPlaying(on) { want = on; if (on) play(); else if (v.pause) v.pause(); },
      dispose() { disposed = true; if (unlock) window.removeEventListener('pointerdown', unlock, true); try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) { /* ya no esta */ } el.remove(); },
    };
  }

  function mount(canvas, opts = {}) {
    // El canvas es transparente porque detras va la capa liquida. Con "reducir movimiento" no se pone y el canvas pinta su
    // fondo negro de siempre.
    const useLiquid = opts.liquid !== false && !rmq.matches && !!canvas.parentNode;
    const ctx = canvas.getContext('2d', { alpha: useLiquid });
    if (!ctx) return () => {};
    const liquid = useLiquid ? makeLiquid(canvas.parentNode, canvas) : null;

    const R = rng(20261022);
    const coarse = coarseq.matches;
    const S = { W: 0, H: 0, U: 1, scale: 1, scaleMax: 1, degraded: false, raf: 0, last: 0, t: 0, cost: 0, gap: 0, over: 0,
                low: false, panel: false, mx: 0, my: 0, px: 0, py: 0, active: false, mx_px: -9999, my_px: -9999,
                ready: false, dead: false };

    const NF = coarse ? FILAMENTS.mobile : FILAMENTS.desktop, NS = coarse ? STEPS.mobile : STEPS.desktop;
    const threads = Array.from({ length: NF }, () => ({
      sx: R() * 1.1 - 0.05, sy: R() * 1.1 - 0.05, z: R(),
      d1: 0.05 + R() * 0.06, d2: 0.04 + R() * 0.06, ph: R() * 6.28,
      bead: R(), bs: 0.03 + R() * 0.04,
      pts: new Float32Array((NS * 2 + 1) * 2),
    }));
    const NM = coarse ? MOTES.mobile : MOTES.desktop;
    const motes = Array.from({ length: NM }, () => {
      const z = R();
      return { nx: R() * 2.3 - 1.15, ny: R() * 2.3 - 1.15, z,
        r: 2 + (1 - z) * 4 + z * 8 + R() * 6 + (R() < 0.18 ? 10 : 0),
        v: 0.006 + R() * 0.014, sw: 0.2 + R() * 0.35, amp: 6 + R() * 16, ph: R() * 6.28, fr: 0.5 + R() * 1.2,
        ox: 0, oy: 0, vx: 0, vy: 0 };
    });
    const SP = { disc: discSprite(COLOR.mote, false), ring: discSprite(COLOR.mote, true), spark: sparkSprite(COLOR.thread) };

    function resize() {
      S.scaleMax = Math.min(window.devicePixelRatio || 1, coarse ? SCALE.mobile : SCALE.desktop);
      S.scale = S.degraded ? Math.min(S.scale, S.scaleMax) : S.scaleMax;   // si ya tuvo que bajar la resolucion, no la vuelve a subir
      applySize();
    }
    function applySize() {
      S.W = Math.max(1, canvas.clientWidth || window.innerWidth);
      S.H = Math.max(1, canvas.clientHeight || window.innerHeight);
      S.U = Math.max(S.W, S.H);
      canvas.width = Math.round(S.W * S.scale); canvas.height = Math.round(S.H * S.scale);
      ctx.setTransform(S.scale, 0, 0, S.scale, 0, 0);
      if (rmq.matches || !S.raf) draw();
    }

    function update(dt) {
      // el cursor se suaviza; sin cursor (movil) solo queda el movimiento propio
      S.px = lerp(S.px, S.mx, 1 - Math.exp(-3 * dt)); S.py = lerp(S.py, S.my, 1 - Math.exp(-3 * dt));
      if (rmq.matches) return;
      for (const m of motes) {
        m.ny -= m.v * dt;                                   // suben despacio
        if (m.ny < -1.15) { m.ny = 1.15; m.nx = R() * 2.3 - 1.15; m.ox = m.oy = m.vx = m.vy = 0; }
        if (S.active) {                                     // el cursor las aparta un poco y vuelven (resorte)
          const x = (m.nx * 0.5 + 0.5) * S.W + m.ox, y = (m.ny * 0.5 + 0.5) * S.H + m.oy;
          const dx = x - S.mx_px, dy = y - S.my_px, rr = S.U * 0.09 + m.r * 2;
          if (dx * dx + dy * dy < rr * rr) { const d = Math.hypot(dx, dy); if (d > 1) { const f = (1 - d / rr) * 140; m.vx += (dx / d) * f * dt; m.vy += (dy / d) * f * dt; } }
        }
        m.vx += -m.ox * 5 * dt; m.vy += -m.oy * 5 * dt; m.vx *= Math.exp(-4 * dt); m.vy *= Math.exp(-4 * dt);
        m.ox += m.vx * dt; m.oy += m.vy * dt;
      }
    }

    function drawThread(f, t, par, glow) {
      const { W, H, U } = S, depth = 1 - f.z * 0.55;       // cerca = 1, lejos = .45
      const h = U * 0.0105 * (0.8 + f.z * 0.45) * (28 / NS);   // largo de cada paso (el hilo mide lo mismo con menos pasos)
      const sway = U * 0.03, pts = f.pts;
      const x0 = f.sx * W + Math.sin(t * f.d1 + f.ph) * sway + S.px * 26 * depth * par;
      const y0 = f.sy * H + Math.cos(t * f.d2 + f.ph) * sway + S.py * 20 * depth * par;
      pts[NS * 2] = x0; pts[NS * 2 + 1] = y0;               // la semilla va en el centro; se traza hacia atras y hacia delante
      for (let dir = -1; dir <= 1; dir += 2) {
        let x = x0, y = y0;
        for (let i = 1; i <= NS; i++) {
          const a = flow(x / U, y / U, t) + (dir < 0 ? Math.PI : 0);
          x += Math.cos(a) * h; y += Math.sin(a) * h;
          pts[(NS + dir * i) * 2] = x; pts[(NS + dir * i) * 2 + 1] = y;
        }
      }
      const n = NS * 2 + 1, ax = pts[0], ay = pts[1], bx = pts[(n - 1) * 2], by = pts[(n - 1) * 2 + 1];
      // UN degradado a lo largo del hilo (de punta a punta): nace y muere suave sin dibujarlo tramo a tramo
      const g = ctx.createLinearGradient(ax, ay, Math.abs(bx - ax) + Math.abs(by - ay) < 1 ? ax + 1 : bx, by);
      g.addColorStop(0, `rgba(${COLOR.thread},0)`); g.addColorStop(0.18, `rgba(${COLOR.thread},0.7)`);
      g.addColorStop(0.5, `rgba(${COLOR.thread},1)`); g.addColorStop(0.82, `rgba(${COLOR.thread},0.7)`); g.addColorStop(1, `rgba(${COLOR.thread},0)`);
      ctx.strokeStyle = g;
      ctx.beginPath(); ctx.moveTo(ax, ay);
      for (let i = 1; i < n; i++) ctx.lineTo(pts[i * 2], pts[i * 2 + 1]);
      const k = ALPHA.thread * (0.45 + 0.55 * depth);
      if (glow) { ctx.lineWidth = 4.6; ctx.globalAlpha = 0.17 * k; ctx.stroke(); }
      ctx.lineWidth = 1.1; ctx.globalAlpha = k; ctx.stroke();
      // chispa que recorre el hilo
      const bi = Math.floor(((f.bead + t * f.bs) % 1) * (n - 1)), e = Math.pow(Math.sin(Math.PI * (bi + 0.5) / (n - 1)), 1.3), br = 7 * depth + 3;
      ctx.globalAlpha = Math.min(1, 0.9 * e);
      ctx.drawImage(SP.spark, pts[bi * 2] - br, pts[bi * 2 + 1] - br, br * 2, br * 2);
    }

    function drawMote(m, t, par) {
      const { W, H } = S, depth = 1 - m.z * 0.65, k = W < 600 ? 0.75 : 1;
      const x = (m.nx * 0.5 + 0.5) * W + m.ox + Math.sin(t * m.sw + m.ph) * m.amp + S.px * 30 * depth * par;
      const y = (m.ny * 0.5 + 0.5) * H + m.oy + S.py * 22 * depth * par;
      const r = m.r * k, tw = 0.78 + 0.22 * Math.sin(t * m.fr + m.ph);
      // las lejanas son mas grandes y mas tenues (difusas); las cercanas, pequenas y nitidas
      ctx.globalAlpha = ALPHA.mote * tw * (0.35 + 0.65 * depth) * (r > 12 ? 0.5 : 1);
      ctx.drawImage(r > 10 ? SP.ring : SP.disc, x - r, y - r, r * 2, r * 2);
    }

    function draw() {
      const { W, H } = S, t = S.t;
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      if (liquid) ctx.clearRect(0, 0, W, H); else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
      const par = rmq.matches ? 0 : 1;
      const nt = S.low ? Math.ceil(threads.length / 2) : threads.length, nm = S.low ? Math.ceil(motes.length / 2) : motes.length;
      for (let i = 0; i < nt; i++) drawThread(threads[i], t, par, !S.low);
      for (let i = 0; i < nm; i++) drawMote(motes[i], t, par);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }

    function frame(ts) {
      if (S.dead) return;
      const interval = 1000 / (S.panel ? FPS.panel : FPS.normal);
      if (S.last && ts - S.last < interval - 2) { S.raf = requestAnimationFrame(frame); return; }   // tope de fps
      const gap = S.last ? ts - S.last : 0;
      const dt = Math.min(0.1, (S.last ? ts - S.last : 0) / 1000); S.last = ts; S.t += dt;
      const c0 = now();
      update(dt); draw();
      S.cost = lerp(S.cost, now() - c0, 0.1);
      if (gap > 0 && gap < 250) S.gap = lerp(S.gap, gap, 0.1);
      // si va justo (el dibujo cuesta mucho o no llega a 30 fps): primero baja la resolucion y, si sigue igual, usa la mitad de hilos y motas
      if (S.cost > 9 || S.gap > interval * 1.4) {
        if (++S.over > 45) {
          S.over = 0; S.gap = interval;
          if (S.scale > SCALE.min + 0.01) { S.scale = Math.max(SCALE.min, S.scale - 0.2); S.degraded = true; applySize(); } else S.low = true;
        }
      } else S.over = 0;
      if (!S.ready) { S.ready = true; opts.onReady && opts.onReady(); }
      S.raf = rmq.matches || document.hidden ? 0 : requestAnimationFrame(frame);
    }

    // ---- eventos ---------------------------------------------------------------------------------------------
    const wake = () => { if (!S.raf && !S.dead && !document.hidden && !rmq.matches) { S.last = 0; S.raf = requestAnimationFrame(frame); } };
    const onMove = ev => {
      S.mx_px = ev.clientX; S.my_px = ev.clientY; S.mx = (ev.clientX / S.W - 0.5) * 2; S.my = (ev.clientY / S.H - 0.5) * 2; S.active = true;
      wake();
    };
    const onLeave = () => { S.active = false; S.mx = 0; S.my = 0; S.mx_px = S.my_px = -9999; };
    const onVis = () => {
      if (document.hidden) { cancelAnimationFrame(S.raf); S.raf = 0; liquid && liquid.setPlaying(false); }
      else { wake(); liquid && liquid.setPlaying(!S.panel); }
    };
    const onRm = () => { cancelAnimationFrame(S.raf); S.raf = 0; resize(); wake(); };
    // con un panel abierto (about me, guestbook, settings) el menu no se ve: el fondo liquido se pausa y el canvas baja a 15 fps.
    // Se marca <html class="panel-open"> (el CSS lo usa en vez de :has(), que cuesta en cada cambio del DOM).
    const checkPanel = () => {
      const open = !!document.querySelector('.home-screen--panel');
      if (open === S.panel) return;
      S.panel = open; document.documentElement.classList.toggle('panel-open', open);
      if (liquid) setTimeout(() => { if (S.panel === open && !S.dead) liquid.setPlaying(!open); }, open ? 600 : 0);   // tras el fundido
    };
    const panelTimer = setInterval(checkPanel, 200);
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
      S.dead = true; cancelAnimationFrame(S.raf); S.raf = 0; clearInterval(panelTimer);
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerleave', onLeave);
      document.documentElement.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', onVis);
      rmq.removeEventListener && rmq.removeEventListener('change', onRm);
      document.documentElement.classList.remove('panel-open');
      delete canvas.__takeMenuBg;
      if (liquid) liquid.dispose();
    };
  }

  window.TakeMenuBg = { version: '3.0.0', mount };
  window.dispatchEvent(new Event('take-menubg-ready'));
})();
