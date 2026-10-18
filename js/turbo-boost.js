/*!
 * Turbo Boost + cursor-reactive "3D" for the Skyline background (spec section 8).
 *
 * - Works only while the "Skyline" background is active (html[data-scene="neutral"]) and no side panel is open.
 * - The car never moves on the page: the cursor only drives a restrained perspective/parallax on the media
 *   element itself (never on a parent container), plus a soft specular light that slides over the bodywork.
 * - ONE requestAnimationFrame loop (delta-time based) drives cursor spring, boost timeline, particles and canvas.
 *   The loop sleeps when everything is at rest, and while the tab is hidden.
 * - prefers-reduced-motion: tiny parallax, no shake / streaks / chromatic aberration, fewer particles.
 *
 * Remove the feature: delete the two <script>/<link> tags that mention turbo-boost in index.html.
 */
(() => {
  'use strict';
  if (window.__turboBoost) return;

  const doc = document;
  const root = doc.documentElement;
  const rmq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarseq = window.matchMedia('(hover: none), (pointer: coarse)');

  // ---- Car landmarks, normalised to the video frame (x, y in 0..1) ---------------------------------------------
  const CAR = {
    box: { x0: 0.25, x1: 0.755, y0: 0.42, y1: 0.695 },
    heads: [[0.579, 0.571, 1.0], [0.718, 0.574, 0.55]],   // x, y, weight
    rear: [0.262, 0.60],                                  // where the particles leave the car
    under: { x0: 0.30, x1: 0.725, y: 0.682 },             // underglow line
  };
  const COLORS = ['#22d3ee', '#a78bfa', '#ffffff', '#e879f9', '#67e8f9', '#8b5cf6'];

  // ---- Tunables -----------------------------------------------------------------------------------------------
  const BOOST_MS = 1000;           // total length (spec: 700-1200 ms)
  const MAX_PARTICLES = 220;
  const MAX_STREAKS = 18;
  const CURSOR_IDLE_MS = 1400;     // after this the pose eases back to neutral

  const S = {
    scene: '', panel: false, media: null, active: false, uiVisible: false,
    W: 0, H: 0, dpr: 1, map: null,
    tx: 0, ty: 0, x: 0, y: 0, vx: 0, vy: 0, lastMove: 0,
    boosting: false, t0: 0, burstDone: false, streamAcc: 0, streakAcc: 0, seed: 1,
    raf: 0, last: 0, ema: 16, perfLow: false, caOn: false, dirty: true,
  };
  const rm = () => rmq.matches;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const ease = { out: t => 1 - Math.pow(1 - t, 3), inOut: t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) };

  // ---- DOM ----------------------------------------------------------------------------------------------------
  let fx, cv, ctx, ui, btn, live, svg, caOffR, caOffB;

  function build() {
    fx = doc.createElement('div');
    fx.className = 'turbo-fx';
    fx.setAttribute('aria-hidden', 'true');
    cv = doc.createElement('canvas');
    fx.appendChild(cv);
    ctx = cv.getContext('2d', { alpha: true });

    ui = doc.createElement('div');
    ui.className = 'turbo-ui';
    ui.innerHTML =
      '<button type="button" class="turbo-btn" data-state="idle" aria-label="Turbo boost (shortcut: Space)">' +
      '<svg class="turbo-bolt" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">' +
      '<path d="M13.4 2 5 13.2h5.6L9.6 22 19 9.8h-5.8L13.4 2z" fill="currentColor"/></svg>' +
      '<span class="turbo-label">Turbo boost</span><kbd class="turbo-key" aria-hidden="true">space</kbd></button>';
    btn = ui.firstChild;

    live = doc.createElement('div');
    live.className = 'turbo-sr';
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');

    svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none';
    svg.innerHTML =
      '<filter id="turbo-ca" x="-3%" y="-3%" width="106%" height="106%" color-interpolation-filters="sRGB">' +
      '<feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r"/>' +
      '<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g"/>' +
      '<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b"/>' +
      '<feOffset in="r" dx="0" dy="0" result="ro"/><feOffset in="b" dx="0" dy="0" result="bo"/>' +
      '<feBlend in="ro" in2="g" mode="screen" result="rg"/><feBlend in="rg" in2="bo" mode="screen"/></filter>';
    caOffR = svg.querySelector('feOffset[result="ro"]');
    caOffB = svg.querySelector('feOffset[result="bo"]');

    btn.addEventListener('click', () => trigger('button'));
  }

  // React may rebuild <body> children; make sure our nodes stay attached.
  function ensureDom() {
    if (!fx) build();
    const b = doc.body;
    if (!b) return;
    if (!fx.isConnected) b.appendChild(fx);
    if (!ui.isConnected) b.appendChild(ui);
    if (!live.isConnected) b.appendChild(live);
    if (!svg.isConnected) b.appendChild(svg);
  }

  // ---- Layout: where is the car on screen? ---------------------------------------------------------------------
  function findMedia() {
    return doc.querySelector('.home .background-video') || null;
  }

  function computeMap() {
    const m = S.media;
    if (!m) return null;
    const W = m.offsetWidth || window.innerWidth;
    const H = m.offsetHeight || window.innerHeight;
    const vw = m.videoWidth || m.naturalWidth || 1920;
    const vh = m.videoHeight || m.naturalHeight || 1080;
    const sc = Math.max(W / vw, H / vh);
    const dw = vw * sc, dh = vh * sc;
    let px = 0.4, py = 0.5;
    try {
      const op = getComputedStyle(m).objectPosition.split(' ');
      const f = s => (s.endsWith('%') ? parseFloat(s) / 100 : s === 'left' || s === 'top' ? 0 : s === 'right' || s === 'bottom' ? 1 : 0.5);
      px = f(op[0]); py = f(op[1] || 'center');
    } catch (_) { /* keep defaults */ }
    const ox = (W - dw) * px, oy = (H - dh) * py;
    return { W, H, dw, dh, ox, oy, k: dh / 1080 };
  }

  const sx = nx => S.map.ox + nx * S.map.dw;
  const sy = ny => S.map.oy + ny * S.map.dh;

  function resize() {
    S.W = window.innerWidth; S.H = window.innerHeight;
    S.dpr = S.perfLow || rm() ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
    if (cv) {
      cv.width = Math.round(S.W * S.dpr); cv.height = Math.round(S.H * S.dpr);
      cv.style.width = S.W + 'px'; cv.style.height = S.H + 'px';
    }
    S.map = computeMap();
    placeButton();
    S.dirty = true;
    wake();
  }

  function placeButton() {
    if (!ui || !S.map) return;
    const bw = btn.offsetWidth || 170, bh = btn.offsetHeight || 40;
    let x, y;
    if (S.W <= 700) {                       // phones: bottom centre
      x = (S.W - bw) / 2; y = S.H - bh - 28;
    } else {                                // desktop: just under the car, centred on it
      x = sx((CAR.box.x0 + CAR.box.x1) / 2) - bw / 2;
      y = sy(CAR.box.y1) + 34 * S.map.k + 10;
    }
    x = clamp(x, 16, S.W - bw - 16);
    y = clamp(y, 90, S.H - bh - 22);
    ui.style.setProperty('--tx', Math.round(x) + 'px');
    ui.style.setProperty('--ty', Math.round(y) + 'px');
  }

  // ---- Scene polling (cheap, robust against React re-renders) ---------------------------------------------------
  function poll() {
    ensureDom();
    const scene = root.dataset.scene || '';
    const panel = !!doc.querySelector('.home-screen--panel');
    const media = scene === 'neutral' ? findMedia() : null;
    const changedMedia = media !== S.media;
    if (changedMedia && S.media) resetMedia(S.media);
    S.media = media;
    if (media && changedMedia) primeMedia(media);
    const active = !!media;
    const uiVisible = active && !panel;
    const sizeKey = media ? (media.videoWidth || media.naturalWidth || 0) + 'x' + media.offsetWidth : '';
    if (changedMedia || sizeKey !== S.sizeKey || active !== S.active) {
      S.sizeKey = sizeKey; S.active = active; S.scene = scene;
      resize();
    }
    if (panel !== S.panel || uiVisible !== S.uiVisible) {
      S.panel = panel; S.uiVisible = uiVisible;
      ui.dataset.visible = uiVisible ? 'true' : 'false';
      btn.tabIndex = uiVisible ? 0 : -1;
      if (!uiVisible) { ui.setAttribute('inert', ''); } else { ui.removeAttribute('inert'); }
    }
    fx.style.display = active ? '' : 'none';
    if (!active && S.boosting) endBoost();
  }

  const BASE = 'scale(1.07)';          // slight over-scale so the perspective/parallax never reveals the edges
  function resetMedia(m) {
    m.style.transform = ''; m.style.filter = ''; m.style.willChange = ''; m.style.transformOrigin = '';
  }
  function primeMedia(m) { m.style.transformOrigin = '50% 62%'; m.style.transform = BASE; }

  // ---- Input ----------------------------------------------------------------------------------------------------
  function onPointer(e) {
    if (!S.active || e.pointerType === 'touch') return;
    S.tx = clamp((e.clientX / window.innerWidth - 0.5) * 2, -1, 1);
    S.ty = clamp((e.clientY / window.innerHeight - 0.5) * 2, -1, 1) * 0.5;   // vertical response is smaller
    S.lastMove = performance.now();
    wake();
  }

  const isEditable = el => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  const isInteractive = el => !!el && !!el.closest && !!el.closest('button,a,summary,[role="button"],[role="link"],[role="tab"],[tabindex]:not([tabindex="-1"])');

  function onKey(e) {
    if (e.code !== 'Space' && e.key !== ' ') return;
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.defaultPrevented) return;
    if (!S.active || !S.uiVisible) return;
    const t = e.target;
    if (isEditable(t) || isInteractive(t)) return;       // never steal Space from typing or focused controls
    e.preventDefault();
    trigger('key');
  }

  // ---- Boost ----------------------------------------------------------------------------------------------------
  function trigger(source) {
    if (!S.active || S.boosting || doc.hidden) return false;
    S.boosting = true; S.t0 = performance.now(); S.burstDone = false; S.streamAcc = 0; S.streakAcc = 0;
    S.seed = (S.seed * 16807) % 2147483647;
    btn.dataset.state = 'boost';
    btn.setAttribute('aria-disabled', 'true');
    live.textContent = 'Turbo boost engaged';
    wake();
    return true;
  }

  function endBoost() {
    S.boosting = false;
    btn.dataset.state = 'idle';
    btn.removeAttribute('aria-disabled');
    for (const p of P) p.on = false;
    for (const s of ST) s.on = false;
    if (S.caOn) { S.caOn = false; }
    if (S.media) { S.media.style.filter = ''; }
    S.dirty = true; wake();
    setTimeout(() => { if (!S.boosting) live.textContent = ''; }, 900);
  }

  function setCA(px) {
    const on = px > 0.12;
    if (on) {
      caOffR.setAttribute('dx', px.toFixed(2)); caOffB.setAttribute('dx', (-px).toFixed(2));
      if (!S.caOn) S.caOn = true;
      S.media.style.filter = 'url(#turbo-ca) saturate(1.18) brightness(1.06)';
    } else if (S.caOn) {
      S.caOn = false;
      S.media.style.filter = '';
    }
  }

  // ---- Particles / streaks (pooled) ----------------------------------------------------------------------------
  const P = Array.from({ length: MAX_PARTICLES }, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, a: 0, max: 1, s: 2, c: '#fff' }));
  const ST = Array.from({ length: MAX_STREAKS }, () => ({ on: false, x: 0, y: 0, len: 0, v: 0, a: 0, max: 1, c: '#fff' }));
  let rs = 12345;
  const rnd = () => { rs = (rs * 1664525 + 1013904223) >>> 0; return rs / 4294967296; };

  function spawnParticle() {
    let p = null;
    for (let i = 0; i < P.length; i++) if (!P[i].on) { p = P[i]; break; }
    if (!p) return;
    const k = S.map.k;
    const ang = (rnd() - 0.5) * 0.6;
    const sp = (520 + rnd() * 1250) * k * (rm() ? 0.45 : 1);
    p.on = true;
    p.x = sx(CAR.rear[0]) + (rnd() - 0.5) * 12 * k;
    p.y = sy(CAR.rear[1]) + (rnd() - 0.5) * 46 * k;
    p.vx = -Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp * 0.5 - rnd() * 60 * k;
    p.a = 0; p.max = 0.35 + rnd() * 0.6;
    p.s = (rnd() < 0.55 ? 2 : rnd() < 0.7 ? 3 : 4) * Math.max(1, k);
    p.c = COLORS[(rnd() * COLORS.length) | 0];
  }

  function spawnStreak() {
    let s = null;
    for (let i = 0; i < ST.length; i++) if (!ST[i].on) { s = ST[i]; break; }
    if (!s) return;
    const m = S.map, k = m.k;
    const y0 = sy(CAR.box.y0) - 90 * k, y1 = sy(CAR.box.y1) + 60 * k;
    s.on = true;
    s.y = y0 + rnd() * (y1 - y0);
    s.x = S.W * (0.25 + rnd() * 0.85);
    s.len = (160 + rnd() * 420) * k;
    s.v = (1800 + rnd() * 2400) * k;
    s.a = 0; s.max = 0.28 + rnd() * 0.3;
    s.c = rnd() < 0.5 ? '#67e8f9' : rnd() < 0.5 ? '#c4b5fd' : '#f5d0fe';
  }

  // ---- Main loop ------------------------------------------------------------------------------------------------
  function wake() {
    if (!S.raf && S.active && !doc.hidden) { S.last = performance.now(); S.raf = requestAnimationFrame(tick); }
  }

  function tick(now) {
    S.raf = 0;
    if (!S.active || doc.hidden || !S.map) return;
    const dtRaw = (now - S.last) / 1000;
    S.last = now;
    const dt = clamp(dtRaw || 0.016, 0.001, 0.05);
    S.ema = S.ema * 0.92 + dt * 1000 * 0.08;
    const low = S.perfLow ? S.ema > 22 : S.ema > 34;      // hysteresis: avoids flip-flopping
    if (low !== S.perfLow) { S.perfLow = low; resize(); }

    const reduced = rm();
    const amp = reduced ? 0.22 : 1;

    // 1) cursor / pose target
    let tx = S.tx, ty = S.ty;
    const coarse = coarseq.matches;
    if (coarse) {                                         // touch: slow autonomous sway, no pointer needed
      const t = now / 1000;
      tx = Math.sin(t * 0.33) * 0.55; ty = Math.sin(t * 0.27 + 1.3) * 0.18;
    } else if (now - S.lastMove > CURSOR_IDLE_MS) {       // ease back to neutral
      const d = Math.exp(-dt / 0.85);
      S.tx *= d; S.ty *= d; tx = S.tx; ty = S.ty;
      if (Math.abs(S.tx) < 0.0008) S.tx = tx = 0;
      if (Math.abs(S.ty) < 0.0008) S.ty = ty = 0;
    }

    // 2) spring (critically-damped-ish, sub-stepped, frame-rate independent)
    const K = 52, C = 13.5;
    let n = Math.ceil(dt / 0.008);
    const h = dt / n;
    while (n--) {
      S.vx += ((tx - S.x) * K - S.vx * C) * h; S.x += S.vx * h;
      S.vy += ((ty - S.y) * K - S.vy * C) * h; S.y += S.vy * h;
    }

    // 3) boost timeline
    let I = 0, punch = 0, susp = 0, shakeX = 0, shakeY = 0, tb = 0;
    if (S.boosting) {
      tb = S.freezeTb != null ? S.freezeTb : (now - S.t0) / BOOST_MS;
      if (tb >= 1) { endBoost(); } else {
        const rise = 0.18, peak = 0.42;
        I = tb < rise ? ease.out(tb / rise) : tb < peak ? 1 : 1 - ease.inOut((tb - peak) / (1 - peak));
        const ts = tb * BOOST_MS / 1000;
        if (!reduced) {
          punch = Math.exp(-ts * 5.2) * (1 - Math.exp(-ts * 42));                   // camera impulse
          susp = 7 * Math.exp(-ts * 7) * Math.sin(ts * 22);                           // compress -> rebound -> settle
          const sh = I * (S.perfLow ? 0.5 : 1);
          shakeX = (rnd() - 0.5) * 2.4 * sh; shakeY = (rnd() - 0.5) * 2.0 * sh;
        } else {
          susp = 1.5 * Math.exp(-ts * 8) * Math.sin(ts * 22);
        }
        // emitters
        const burst = reduced ? 26 : S.perfLow ? 55 : 95;
        if (!S.burstDone) { S.burstDone = true; for (let i = 0; i < burst; i++) spawnParticle(); }
        if (tb < 0.5) {
          S.streamAcc += dt * (reduced ? 40 : S.perfLow ? 70 : 130);
          while (S.streamAcc >= 1) { S.streamAcc--; spawnParticle(); }
        }
        if (!reduced && tb < 0.62) {
          S.streakAcc += dt * (S.perfLow ? 14 : 30);
          while (S.streakAcc >= 1) { S.streakAcc--; spawnStreak(); }
        }
      }
    }

    // 4) apply to the media element only (never to a parent container)
    const m = S.media, k = S.map.k;
    const px = -S.x * 11 * amp + shakeX, py = -S.y * 8 * amp + susp * k + shakeY;
    const ry = -S.x * 1.7 * amp, rx = -S.y * 1.0 * amp;
    const scale = 1.07 + 0.032 * punch * (reduced ? 0 : 1);
    m.style.willChange = 'transform';
    m.style.transformOrigin = '50% 62%';
    m.style.transform =
      'perspective(1500px) translate3d(' + px.toFixed(2) + 'px,' + py.toFixed(2) + 'px,0) ' +
      'rotateX(' + rx.toFixed(3) + 'deg) rotateY(' + ry.toFixed(3) + 'deg) scale(' + scale.toFixed(4) + ')';
    if (!reduced && !S.perfLow && S.boosting) setCA(3.4 * Math.pow(I, 1.6) * (tb < 0.75 ? 1 : 0)); else if (S.caOn) setCA(0);

    // 5) canvas (specular light, headlights, neon, sweep, streaks, particles)
    draw(dt, I, tb, reduced);
    placeButton();

    // keep running only while something is moving
    const moving = Math.abs(S.x - tx) > 0.0007 || Math.abs(S.vx) > 0.0007 || Math.abs(S.y - ty) > 0.0007 || Math.abs(S.vy) > 0.0007;
    if (S.boosting || moving || coarse && !reduced) S.raf = requestAnimationFrame(tick);
    else { S.dirty = true; settle(); }
  }

  function settle() {                                      // fully at rest: clean canvas, neutral transform
    if (S.media) { S.media.style.transform = BASE; S.media.style.willChange = ''; }
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    ctx.clearRect(0, 0, S.W, S.H);
  }

  function draw(dt, I, tb, reduced) {
    const m = S.map, k = m.k;
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    ctx.clearRect(0, 0, S.W, S.H);
    ctx.globalCompositeOperation = 'lighter';

    const cx = sx((CAR.box.x0 + CAR.box.x1) / 2), cw = (CAR.box.x1 - CAR.box.x0) * m.dw;
    const top = sy(CAR.box.y0), ch = (CAR.box.y1 - CAR.box.y0) * m.dh;

    // a) cursor-driven specular light gliding over the bodywork
    {
      const lx = cx + S.x * cw * 0.32, ly = top + ch * (0.34 + S.y * 0.35);
      const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, cw * 0.42);
      const a = 0.05 * Math.min(1, Math.abs(S.x) * 1.6 + 0.25) + 0.16 * I;
      g.addColorStop(0, 'rgba(196,181,253,' + a.toFixed(3) + ')');
      g.addColorStop(0.5, 'rgba(103,232,249,' + (a * 0.35).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(103,232,249,0)');
      ctx.fillStyle = g; ctx.fillRect(lx - cw * 0.45, ly - cw * 0.45, cw * 0.9, cw * 0.9);
    }

    // b) neon underglow (faint at rest, intensifies on boost)
    {
      const x0 = sx(CAR.under.x0), x1 = sx(CAR.under.x1), y = sy(CAR.under.y);
      const a = 0.06 + 0.46 * I, rx = (x1 - x0) * 0.36, sq = 0.075 + 0.05 * I;
      const glow = (gx, rgb, aa) => {
        ctx.save(); ctx.translate(gx, y); ctx.scale(1, sq);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
        g.addColorStop(0, 'rgba(' + rgb + ',' + aa.toFixed(3) + ')');
        g.addColorStop(0.45, 'rgba(' + rgb + ',' + (aa * 0.38).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(' + rgb + ',0)');
        ctx.fillStyle = g; ctx.fillRect(-rx, -rx, rx * 2, rx * 2); ctx.restore();
      };
      glow(x0 + (x1 - x0) * 0.34, '139,92,246', a);
      glow(x0 + (x1 - x0) * 0.68, '34,211,238', a * 0.9);
      if (I > 0.05) glow((x0 + x1) / 2, '232,121,249', a * 0.5);
    }

    // c) headlights
    if (I > 0.003) {
      for (const [hx, hy, w] of CAR.heads) {
        const x = sx(hx), y = sy(hy), r = (50 + 150 * I) * k * w;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(255,255,255,' + (0.95 * I * w).toFixed(3) + ')');
        g.addColorStop(0.18, 'rgba(165,243,252,' + (0.55 * I * w).toFixed(3) + ')');
        g.addColorStop(0.55, 'rgba(167,139,250,' + (0.18 * I * w).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(167,139,250,0)');
        ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      // brief screen flash at the very start
      if (tb < 0.14 && !reduced) {
        ctx.fillStyle = 'rgba(196,181,253,' + (0.10 * (1 - tb / 0.14)).toFixed(3) + ')';
        ctx.fillRect(0, 0, S.W, S.H);
      }
    }

    // d) reflection sweep across the bodywork (soft elliptical mask)
    if (S.boosting && tb > 0.04 && tb < 0.82) {
      const u = ease.inOut(clamp((tb - 0.04) / 0.72, 0, 1));
      const bx = cx - cw * 0.5 + (cw + ch * 1.2) * u - ch * 0.6;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, top + ch * 0.58, cw * 0.5, ch * 0.5, 0, 0, Math.PI * 2);
      ctx.clip();
      const bw = cw * 0.16;
      const g = ctx.createLinearGradient(bx - bw, 0, bx + bw, 0);
      const a = 0.42 * Math.sin(Math.PI * u) * Math.min(1, I + 0.35);
      g.addColorStop(0, 'rgba(139,92,246,0)'); g.addColorStop(0.35, 'rgba(34,211,238,' + (a * 0.6).toFixed(3) + ')');
      g.addColorStop(0.5, 'rgba(255,255,255,' + a.toFixed(3) + ')'); g.addColorStop(0.65, 'rgba(232,121,249,' + (a * 0.6).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(139,92,246,0)');
      ctx.fillStyle = g;
      ctx.transform(1, 0, -0.35, 1, ch * 0.2, 0);          // slanted band
      ctx.fillRect(bx - bw, top - ch * 0.2, bw * 2, ch * 1.6);
      ctx.restore();
    }

    // e) motion streaks
    for (const s of ST) {
      if (!s.on) continue;
      s.a += dt; if (s.a >= s.max) { s.on = false; continue; }
      s.x -= s.v * dt;
      const f = Math.sin(Math.PI * (s.a / s.max));
      const g = ctx.createLinearGradient(s.x, 0, s.x + s.len, 0);
      g.addColorStop(0, s.c); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.8 * f * (0.5 + 0.5 * I);
      ctx.strokeStyle = g; ctx.lineWidth = 2 * Math.max(1, k);
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + s.len, s.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // f) pixel particles shooting backwards from the car
    for (const p of P) {
      if (!p.on) continue;
      p.a += dt; if (p.a >= p.max) { p.on = false; continue; }
      p.vx *= 1 - 1.9 * dt; p.vy = p.vy * (1 - 2.2 * dt) + 30 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const f = 1 - p.a / p.max;
      ctx.globalAlpha = Math.min(1, f * 1.3);
      ctx.fillStyle = p.c;
      const q = 2;                                          // snap to a 2 px grid -> crisp "pixel" look
      ctx.fillRect(Math.round(p.x / q) * q, Math.round(p.y / q) * q, p.s, p.s);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---- Boot -----------------------------------------------------------------------------------------------------
  function start() {
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', resize, { passive: true });
    root.addEventListener('mouseleave', () => { S.lastMove = 0; wake(); });
    doc.addEventListener('visibilitychange', () => { if (doc.hidden) { if (S.boosting) endBoost(); } else wake(); });
    rmq.addEventListener && rmq.addEventListener('change', () => { resize(); });
    setInterval(poll, 250);
    poll();
  }

  window.__turboBoost = { trigger: () => trigger('api'), state: S, freeze: v => { S.freezeTb = v; wake(); } };
  if (doc.readyState === 'complete') setTimeout(start, 400);
  else window.addEventListener('load', () => setTimeout(start, 400));
})();
