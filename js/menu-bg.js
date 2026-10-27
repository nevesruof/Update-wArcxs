/* TKWM-40632a5f-41f0-9fe6-22f804d522ac */
(() => {
  'use strict';
  if (window.TakeMenuBg) return;

  const FILAMENTS = { desktop: 12, mobile: 7 };
  const STEPS = { desktop: 28, mobile: 22 };
  const MOTES = { desktop: 30, mobile: 16 };
  const COLOR = { thread: '126,222,238', mote: '214,240,255' };
  const ALPHA = { thread: 0.42, mote: 0.5 };
  const FPS = { normal: 30, panel: 15 };
  const SCALE = { desktop: 1.25, mobile: 1, min: 0.6 };

  const lerp = (a, b, t) => a + (b - a) * t;
  function rng(seed) {
    return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const mq = q => (window.matchMedia ? window.matchMedia(q) : { matches: false, addEventListener() {} });
  const rmq = mq('(prefers-reduced-motion: reduce)');
  const coarseq = mq('(hover: none), (pointer: coarse)');
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const now = () => (window.performance && performance.now ? performance.now() : Date.now());

  function flow(x, y, t) {
    return Math.sin(x * 3.4 + t * 0.08) * 1.5 + Math.sin(y * 4.1 - t * 0.06 + 1.7) * 1.3 + Math.sin((x - y) * 2.6 + t * 0.045 + 4.1) * 0.9;
  }

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

  function makeAtmo(parent, before) {
    const el = document.createElement('div');
    el.className = 'menu-atmo';
    el.setAttribute('aria-hidden', 'true');
    parent.insertBefore(el, before);
    return { el, dispose() { el.remove(); } };
  }

  function makeLiquid(parent, before) {
    const el = document.createElement('div');
    el.className = 'menu-liquid';
    el.setAttribute('aria-hidden', 'true');

    if (isIOS) {
      const im = document.createElement('img');
      im.alt = ''; im.decoding = 'async'; im.draggable = false; im.src = '/images/menu-bg.webp';
      im.onload = () => el.classList.add('is-on');
      el.appendChild(im);
      parent.insertBefore(el, before);
      return { el, setPlaying() {}, dispose() { el.remove(); } };
    }

    const v = document.createElement('video');
    v.muted = true; v.defaultMuted = true; v.loop = true; v.autoplay = true; v.playsInline = true; v.preload = 'auto';
    v.disablePictureInPicture = true; v.disableRemotePlayback = true; v.controls = false; v.tabIndex = -1;
    ['muted', 'playsinline', 'webkit-playsinline', 'loop', 'autoplay'].forEach(a => v.setAttribute(a, ''));
    v.setAttribute('x-webkit-airplay', 'deny');
    v.setAttribute('controlslist', 'nofullscreen nodownload noremoteplayback');
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
    v.lastChild.addEventListener('error', () => {
      if (disposed || el.querySelector('img')) return;
      const im = document.createElement('img'); im.alt = ''; im.decoding = 'async'; im.src = '/images/menu-bg.webp';
      im.onload = show; v.remove(); el.insertBefore(im, el.firstChild);
    });
    function play() {
      if (!want || disposed || document.hidden) return;
      const p = v.play && v.play();
      if (p && p.catch) p.catch(() => {
        if (unlock) return;
        unlock = () => { window.removeEventListener('pointerdown', unlock, true); unlock = null; play(); };
        window.addEventListener('pointerdown', unlock, { capture: true, once: true, passive: true });
      });
    }
    play();
    return {
      el,
      setPlaying(on) { want = on; if (on) play(); else if (v.pause) v.pause(); },
      dispose() { disposed = true; if (unlock) window.removeEventListener('pointerdown', unlock, true); try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) { } el.remove(); },
    };
  }

  function mount(canvas, opts = {}) {
    const useLiquid = opts.liquid !== false && !rmq.matches && !!canvas.parentNode;
    const ctx = canvas.getContext('2d', { alpha: useLiquid });
    if (!ctx) return () => {};
    const liquid = useLiquid ? makeLiquid(canvas.parentNode, canvas) : null;
    const atmo = makeAtmo(canvas.parentNode, canvas);

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
      S.scale = S.degraded ? Math.min(S.scale, S.scaleMax) : S.scaleMax;
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
      S.px = lerp(S.px, S.mx, 1 - Math.exp(-3 * dt)); S.py = lerp(S.py, S.my, 1 - Math.exp(-3 * dt));
      if (rmq.matches) return;
      for (const m of motes) {
        m.ny -= m.v * dt;
        if (m.ny < -1.15) { m.ny = 1.15; m.nx = R() * 2.3 - 1.15; m.ox = m.oy = m.vx = m.vy = 0; }
        if (S.active) {
          const x = (m.nx * 0.5 + 0.5) * S.W + m.ox, y = (m.ny * 0.5 + 0.5) * S.H + m.oy;
          const dx = x - S.mx_px, dy = y - S.my_px, rr = S.U * 0.09 + m.r * 2;
          if (dx * dx + dy * dy < rr * rr) { const d = Math.hypot(dx, dy); if (d > 1) { const f = (1 - d / rr) * 140; m.vx += (dx / d) * f * dt; m.vy += (dy / d) * f * dt; } }
        }
        m.vx += -m.ox * 5 * dt; m.vy += -m.oy * 5 * dt; m.vx *= Math.exp(-4 * dt); m.vy *= Math.exp(-4 * dt);
        m.ox += m.vx * dt; m.oy += m.vy * dt;
      }
    }

    function drawThread(f, t, par, glow) {
      const { W, H, U } = S, depth = 1 - f.z * 0.55;
      const h = U * 0.0105 * (0.8 + f.z * 0.45) * (28 / NS);
      const sway = U * 0.03, pts = f.pts;
      const x0 = f.sx * W + Math.sin(t * f.d1 + f.ph) * sway + S.px * 26 * depth * par;
      const y0 = f.sy * H + Math.cos(t * f.d2 + f.ph) * sway + S.py * 20 * depth * par;
      pts[NS * 2] = x0; pts[NS * 2 + 1] = y0;
      for (let dir = -1; dir <= 1; dir += 2) {
        let x = x0, y = y0;
        for (let i = 1; i <= NS; i++) {
          const a = flow(x / U, y / U, t) + (dir < 0 ? Math.PI : 0);
          x += Math.cos(a) * h; y += Math.sin(a) * h;
          pts[(NS + dir * i) * 2] = x; pts[(NS + dir * i) * 2 + 1] = y;
        }
      }
      const n = NS * 2 + 1, ax = pts[0], ay = pts[1], bx = pts[(n - 1) * 2], by = pts[(n - 1) * 2 + 1];
      const g = ctx.createLinearGradient(ax, ay, Math.abs(bx - ax) + Math.abs(by - ay) < 1 ? ax + 1 : bx, by);
      g.addColorStop(0, `rgba(${COLOR.thread},0)`); g.addColorStop(0.18, `rgba(${COLOR.thread},0.7)`);
      g.addColorStop(0.5, `rgba(${COLOR.thread},1)`); g.addColorStop(0.82, `rgba(${COLOR.thread},0.7)`); g.addColorStop(1, `rgba(${COLOR.thread},0)`);
      ctx.strokeStyle = g;
      ctx.beginPath(); ctx.moveTo(ax, ay);
      for (let i = 1; i < n; i++) ctx.lineTo(pts[i * 2], pts[i * 2 + 1]);
      const k = ALPHA.thread * (0.45 + 0.55 * depth);
      if (glow) { ctx.lineWidth = 10; ctx.globalAlpha = 0.055 * k; ctx.stroke(); ctx.lineWidth = 4.6; ctx.globalAlpha = 0.17 * k; ctx.stroke(); }
      ctx.lineWidth = 1.1; ctx.globalAlpha = k; ctx.stroke();
      const bi = Math.floor(((f.bead + t * f.bs) % 1) * (n - 1)), e = Math.pow(Math.sin(Math.PI * (bi + 0.5) / (n - 1)), 1.3), br = 7 * depth + 3;
      ctx.globalAlpha = Math.min(1, 0.9 * e);
      ctx.drawImage(SP.spark, pts[bi * 2] - br, pts[bi * 2 + 1] - br, br * 2, br * 2);
    }

    function drawMote(m, t, par) {
      const { W, H } = S, depth = 1 - m.z * 0.65, k = W < 600 ? 0.75 : 1;
      const x = (m.nx * 0.5 + 0.5) * W + m.ox + Math.sin(t * m.sw + m.ph) * m.amp + S.px * 30 * depth * par;
      const y = (m.ny * 0.5 + 0.5) * H + m.oy + S.py * 22 * depth * par;
      const r = m.r * k, tw = 0.78 + 0.22 * Math.sin(t * m.fr + m.ph);
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
      if (S.last && ts - S.last < interval - 2) { S.raf = requestAnimationFrame(frame); return; }
      const gap = S.last ? ts - S.last : 0;
      const dt = Math.min(0.1, (S.last ? ts - S.last : 0) / 1000); S.last = ts; S.t += dt;
      const c0 = now();
      update(dt); draw();
      S.cost = lerp(S.cost, now() - c0, 0.1);
      if (gap > 0 && gap < 250) S.gap = lerp(S.gap, gap, 0.1);
      if (S.cost > 9 || S.gap > interval * 1.4) {
        if (++S.over > 45) {
          S.over = 0; S.gap = interval;
          if (S.scale > SCALE.min + 0.01) { S.scale = Math.max(SCALE.min, S.scale - 0.2); S.degraded = true; applySize(); } else S.low = true;
        }
      } else S.over = 0;
      if (!S.ready) { S.ready = true; opts.onReady && opts.onReady(); }
      S.raf = rmq.matches || document.hidden ? 0 : requestAnimationFrame(frame);
    }

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
    const checkPanel = () => {
      const open = !!document.querySelector('.home-screen--panel');
      if (open === S.panel) return;
      S.panel = open; document.documentElement.classList.toggle('panel-open', open);
      if (liquid) setTimeout(() => { if (S.panel === open && !S.dead) liquid.setPlaying(!open); }, open ? 600 : 0);
    };
    const panelTimer = setInterval(checkPanel, 200);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerleave', onLeave); document.documentElement.addEventListener('mouseleave', onLeave);
    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', onVis);
    rmq.addEventListener && rmq.addEventListener('change', onRm);

    resize();
    if (rmq.matches) { draw(); S.ready = true; opts.onReady && opts.onReady(); } else S.raf = requestAnimationFrame(frame);

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
      if (atmo) atmo.dispose();
    };
  }

  window.TakeMenuBg = { version: '3.0.0', mount };
  window.dispatchEvent(new Event('take-menubg-ready'));
})();
