/*! cubes-bg.js - fondo "Underwater": cubos 3D blancos con glow flotando + particulas que se conectan (tipo atomos).
 *  Canvas 2D, sin dependencias. Solo blanco y negro.
 *
 *  - Los cubos flotan y giran muy despacio; el cursor/dedo mueve la camara un poco (parallax) y los empuja apenas.
 *  - Los cubos fuera del plano de foco se ven mas suaves (profundidad de campo falsa), como las facetas desenfocadas
 *    de una foto con bokeh.
 *  - Una sola rueda de requestAnimationFrame; se pausa con la pestana oculta; prefers-reduced-motion = imagen fija.
 *  - Si el equipo va justo, baja solo las particulas y el brillo (no los cubos).
 *
 *  Uso:  const dispose = window.TakeCubes.mount(canvas, { onReady });   dispose() para quitarlo.
 *  Ajustes rapidos: CUBES (posiciones/tamanos), PART_COUNT, LINK, LIGHT y FOCUS aqui abajo.
 *  TKWM-40632a5f-41f0-9fe6-22f804d522ac
 */
(() => {
  'use strict';
  if (window.TakeCubes) return;

  // ---- Ajustes -----------------------------------------------------------------------------------------------
  // [x, y, z, tamano]: x,y en pantalla (-1..1, izquierda->derecha / arriba->abajo), z = profundidad (0 cerca, 2.5 lejos)
  const CUBES = [   // horizontal (PC): la columna del menu (izquierda) queda libre
    [-0.78, -0.55, 1.6, 0.34], [-0.35,  0.35, 0.2, 0.30], [ 0.10, -0.62, 0.9, 0.22], [ 0.46,  0.06, -0.3, 0.50],
    [ 0.80, -0.35, 1.2, 0.28], [ 0.72,  0.62, 0.4, 0.34], [ 0.16,  0.58, 1.0, 0.34], [-0.08,  0.86, 1.4, 0.24],
    [ 0.28, -0.15, 2.0, 0.16], [-0.55, -0.30, 2.2, 0.14], [ 0.95,  0.05, 2.4, 0.18], [-0.20, -0.30, 0.0, 0.12],
  ];
  const CUBES_PORTRAIT = [   // vertical (celular): logo y menu al centro quedan libres; los cubos van arriba, abajo y a los lados
    [-0.80, -0.74, 1.2, 0.34], [ 0.62, -0.60, 0.5, 0.30], [ 0.02, -0.34, 1.9, 0.16], [ 0.86, -0.08, 1.9, 0.18],
    [-0.90,  0.12, 1.0, 0.26], [ 0.86,  0.40, 0.7, 0.28], [-0.72,  0.93, 0.6, 0.34], [ 0.46,  0.96, 1.5, 0.26],
  ];
  const PART_COUNT = { desktop: 64, mobile: 34 };
  const LINK = 0.17;                  // distancia maxima de union, como fraccion del lado mayor de la pantalla
  const LIGHT = norm([-0.45, -0.75, -0.55]);   // de donde viene la luz (arriba-izquierda-frente)
  const FOCUS = 0.7;                  // profundidad nitida; lo demas se suaviza
  const D = 3.2;                      // distancia de camara (perspectiva)
  const SIZE = 0.40;                  // escala general de los cubos (sube/baja todos a la vez)

  // ---- Utilidades ---------------------------------------------------------------------------------------------
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function rng(seed) {
    return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const mq = q => (window.matchMedia ? window.matchMedia(q) : { matches: false, addEventListener() {} });
  const rmq = mq('(prefers-reduced-motion: reduce)');
  const coarseq = mq('(hover: none), (pointer: coarse)');

  // ---- Geometria del cubo ----------------------------------------------------------------------------------------
  const V = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
  const F = [[0,1,2,3],[4,5,6,7],[0,1,5,4],[3,2,6,7],[1,2,6,5],[0,3,7,4]];
  const FN = [[0,0,-1],[0,0,1],[0,-1,0],[0,1,0],[1,0,0],[-1,0,0]];
  const E = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
  const EF = E.map(([a, b]) => { const r = []; F.forEach((f, i) => { if (f.includes(a) && f.includes(b)) r.push(i); }); return r; });

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
    const R = rng(20261018);
    const coarse = coarseq.matches;
    const S = { W: 0, H: 0, dpr: 1, U: 1, cx: 0, cy: 0, raf: 0, last: 0, t: 0, ema: 16, slow: 0, low: false,
                mx: 0, my: 0, px: 0, py: 0, vx: 0, vy: 0, active: false, ready: false, dead: false };

    // cubos (la disposicion cambia segun la pantalla sea horizontal o vertical)
    let portrait = null, cubes = [];
    function buildCubes(p) {
      const r = rng(20261018);
      return (p ? CUBES_PORTRAIT : CUBES).map(([nx, ny, z, h]) => ({
        nx, ny, z, h: h * SIZE * (p ? 1.15 : 1), ox: 0, oy: 0, vx: 0, vy: 0,
        rx: r() * 6.28, ry: r() * 6.28, rz: r() * 6.28,
        wx: (r() - .5) * 0.22, wy: (r() - .5) * 0.26, wz: (r() - .5) * 0.18,
        ph: r() * 6.28, fr: 0.05 + r() * 0.06,
      }));
    }
    // particulas ("atomos"): cada 7ma es un nucleo con orbita
    const N = coarse ? PART_COUNT.mobile : PART_COUNT.desktop;
    const parts = Array.from({ length: N }, (_, i) => ({
      nx: R() * 2.3 - 1.15, ny: R() * 2.3 - 1.15, z: R() * 2.4,
      vx: (R() - .5) * 0.025, vy: (R() - .5) * 0.025, nuc: i % 7 === 0, ph: R() * 6.28, tilt: R() * 3.14,
    }));

    function resize() {
      const dprMax = coarse ? 1.5 : 2;
      S.dpr = Math.min(window.devicePixelRatio || 1, dprMax);
      S.W = Math.max(1, canvas.clientWidth || window.innerWidth);
      S.H = Math.max(1, canvas.clientHeight || window.innerHeight);
      canvas.width = Math.round(S.W * S.dpr); canvas.height = Math.round(S.H * S.dpr);
      ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
      S.cx = S.W / 2; S.cy = S.H / 2; S.U = Math.min(S.W, S.H) * 0.62 + Math.max(S.W, S.H) * 0.06;
      const pt = S.H > S.W * 1.1; if (pt !== portrait) { portrait = pt; cubes = buildCubes(pt); }
      if (rmq.matches || !S.raf) draw(0);
    }

    // posicion mundo para que (nx, ny, z) caiga en esa parte de la pantalla (sin camara)
    function world(nx, ny, z) { const s = D / (D + z); return [nx * (S.W / 2) / (S.U * s), ny * (S.H / 2) / (S.U * s)]; }
    // camara: giro pequeno alrededor de un pivote en z=1 -> parallax
    function cam(p, cy, sy, cp, sp) {
      const x = p[0], y = p[1], z = p[2] - 1;
      const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
      const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
      return [x1, y2, z2 + 1];
    }
    function proj(p) { const s = D / (D + p[2]); return [S.cx + p[0] * s * S.U, S.cy + p[1] * s * S.U, s]; }

    function update(dt) {
      const t = S.t;
      const still = rmq.matches;
      // el cursor se suaviza; sin cursor (movil) la camara se mece sola
      S.px = lerp(S.px, S.mx, 1 - Math.exp(-3 * dt)); S.py = lerp(S.py, S.my, 1 - Math.exp(-3 * dt));
      S.vx *= Math.exp(-4 * dt); S.vy *= Math.exp(-4 * dt);
      for (const c of cubes) {
        if (!still) { c.rx += c.wx * dt; c.ry += c.wy * dt; c.rz += c.wz * dt; }
        // empuje suave del cursor (resorte que vuelve a su sitio)
        if (S.active && !still) {
          const p = cubeScreen(c), dx = p[0] - S.mx_px, dy = p[1] - S.my_px, d = Math.hypot(dx, dy), r = S.U * 0.34 * p[2] * (c.h / 0.3 + 0.6);
          if (d < r && d > 1) { const f = (1 - d / r) * 60; c.vx += (dx / d) * f * dt; c.vy += (dy / d) * f * dt;
            c.wy += clamp(S.vx * 0.0004, -0.02, 0.02) * (1 - d / r); c.wx += clamp(S.vy * 0.0004, -0.02, 0.02) * (1 - d / r); }
        }
        c.vx += -c.ox * 9 * dt; c.vy += -c.oy * 9 * dt; c.vx *= Math.exp(-5 * dt); c.vy *= Math.exp(-5 * dt);
        c.ox += c.vx * dt; c.oy += c.vy * dt;
        c.wx *= Math.exp(-0.25 * dt) ; c.wy *= Math.exp(-0.25 * dt);   // vuelve al giro lento natural
        if (Math.abs(c.wx) < 0.03) c.wx += (Math.sign(c.wx) || 1) * 0.001;
        if (Math.abs(c.wy) < 0.03) c.wy += (Math.sign(c.wy) || 1) * 0.001;
      }
      for (const p of parts) {
        if (still) continue;
        p.nx += p.vx * dt; p.ny += p.vy * dt;
        if (p.nx > 1.2) p.nx = -1.2; else if (p.nx < -1.2) p.nx = 1.2;
        if (p.ny > 1.2) p.ny = -1.2; else if (p.ny < -1.2) p.ny = 1.2;
      }
    }

    function cubeScreen(c) {
      const t = S.t, fx = Math.sin(t * c.fr * 6.28 + c.ph) * 0.03, fy = Math.cos(t * c.fr * 5.1 + c.ph) * 0.04;
      const w = world(c.nx + fx, c.ny + fy, c.z);
      const pr = proj([w[0], w[1], c.z]);
      return [pr[0] + c.ox, pr[1] + c.oy, pr[2]];
    }

    function frame(now) {
      if (S.dead) return;
      const dt = Math.min(0.05, (now - (S.last || now)) / 1000); S.last = now; S.t += dt;
      // si va justo: menos particulas y brillo, nunca menos cubos
      S.ema = lerp(S.ema, dt * 1000, 0.05);
      if (!S.low && S.ema > 30 && ++S.slow > 90) S.low = true; else if (S.ema <= 30) S.slow = 0;
      update(dt); draw(dt);
      if (!S.ready) { S.ready = true; opts.onReady && opts.onReady(); }
      S.raf = rmq.matches || document.hidden ? 0 : requestAnimationFrame(frame);
    }

    function draw() {
      const { W, H } = S, t = S.t;
      ctx.globalCompositeOperation = 'source-over';
      if (liquid) ctx.clearRect(0, 0, W, H); else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
      const g = ctx.createRadialGradient(W * 0.55, H * 0.45, 0, W * 0.55, H * 0.45, Math.max(W, H) * 0.7);
      g.addColorStop(0, 'rgba(255,255,255,0.055)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      const sway = rmq.matches ? 0 : 1;
      const yaw = (S.px * 0.11 + Math.sin(t * 0.11) * 0.035) * sway, pitch = (S.py * 0.08 + Math.cos(t * 0.09) * 0.02) * sway;
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);

      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';

      // --- particulas -----------------------------------------------------------------------------------------
      const n = S.low ? Math.ceil(parts.length / 2) : parts.length;
      const pts = [];
      for (let i = 0; i < n; i++) {
        const p = parts[i], w = world(p.nx, p.ny, p.z), q = cam([w[0], w[1], p.z], cy, sy, cp, sp), s = proj(q);
        pts.push([s[0], s[1], s[2], p]);
      }
      const th = LINK * Math.max(W, H), th2 = th * th;
      ctx.lineWidth = 1;
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i][0] - pts[j][0], dy = pts[i][1] - pts[j][1], d2 = dx * dx + dy * dy;
        if (d2 < th2) {
          const a = Math.pow(1 - Math.sqrt(d2) / th, 1.4) * 0.34 * Math.min(pts[i][2], pts[j][2]) * 1.2;
          ctx.strokeStyle = `rgba(255,255,255,${a.toFixed(3)})`;
          ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[j][0], pts[j][1]); ctx.stroke();
        }
      }
      for (const [x, y, s, p] of pts) {
        const r = (p.nuc ? 2.3 : 1.3) * s * 1.25;
        ctx.fillStyle = `rgba(255,255,255,${p.nuc ? 0.16 : 0.09})`; ctx.beginPath(); ctx.arc(x, y, r * 4.2, 0, 6.283); ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${p.nuc ? 0.95 : 0.7})`; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
        if (p.nuc) {   // orbita fina con un electron
          const a = 9 * s + 4, ang = t * 0.7 + p.ph;
          ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.ellipse(x, y, a * 1.9, a * 0.7, p.tilt, 0, 6.283); ctx.stroke();
          const ex = Math.cos(ang) * a * 1.9, ey = Math.sin(ang) * a * 0.7;
          ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath();
          ctx.arc(x + ex * Math.cos(p.tilt) - ey * Math.sin(p.tilt), y + ex * Math.sin(p.tilt) + ey * Math.cos(p.tilt), 1.1 * s + .4, 0, 6.283); ctx.fill();
        }
      }

      // --- cubos (de lejos a cerca) ---------------------------------------------------------------------------
      const order = cubes.map(c => c).sort((a, b) => b.z - a.z);
      for (const c of order) drawCube(c, cy, sy, cp, sp);
      ctx.globalCompositeOperation = 'source-over';
    }

    function drawCube(c, cy, sy, cp, sp) {
      const t = S.t;
      const fx = Math.sin(t * c.fr * 6.28 + c.ph) * 0.03, fy = Math.cos(t * c.fr * 5.1 + c.ph) * 0.04;
      const w = world(c.nx + fx, c.ny + fy, c.z);
      const a = Math.cos(c.rx), b = Math.sin(c.rx), cc = Math.cos(c.ry), d = Math.sin(c.ry), e = Math.cos(c.rz), f = Math.sin(c.rz);
      // matriz = Rz * Ry * Rx
      const m = [ cc * e, -b * d * e - a * f, -a * d * e + b * f,
                  cc * f,  -b * d * f + a * e, -a * d * f - b * e,
                  d,        b * cc,             a * cc ];
      const rot = v => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
      const sc = [];
      const vz = [];
      for (const v of V) {
        const r = rot([v[0] * c.h, v[1] * c.h, v[2] * c.h]);
        const p = cam([r[0] + w[0], r[1] + w[1], r[2] + c.z], cy, sy, cp, sp), s = proj(p);
        sc.push([s[0] + c.ox * s[2] * 0 + c.ox, s[1] + c.oy]); vz.push(p[2]);
      }
      const dof = clamp(Math.abs(c.z - FOCUS) / 1.9, 0, 1), sharp = 1 - dof;
      const glow = S.low ? 0.6 : 1;
      // caras: de atras hacia adelante, con brillo segun la luz
      const faces = F.map((idx, i) => {
        const nrm = rot(FN[i]);
        const lit = Math.max(0, -(nrm[0] * LIGHT[0] + nrm[1] * LIGHT[1] + nrm[2] * LIGHT[2]));
        const zavg = (vz[idx[0]] + vz[idx[1]] + vz[idx[2]] + vz[idx[3]]) / 4;
        return { i, lit, zavg, front: nrm[2] < 0 };
      });
      faces.sort((p, q) => q.zavg - p.zavg);
      const lits = faces.map(x => x.lit);
      for (const fc of faces) {
        const idx = F[fc.i];
        const base = (fc.front ? 0.045 : 0.015) + 0.17 * Math.pow(fc.lit, 1.3);
        const al = base * lerp(1, 0.55, dof) * glow;
        const p0 = sc[idx[0]], p2 = sc[idx[2]];
        const gr = ctx.createLinearGradient(p0[0], p0[1], p2[0], p2[1]);
        gr.addColorStop(0, `rgba(255,255,255,${(al * 1.7).toFixed(3)})`); gr.addColorStop(1, `rgba(255,255,255,${(al * 0.25).toFixed(3)})`);
        ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(sc[idx[0]][0], sc[idx[0]][1]);
        for (let k = 1; k < 4; k++) ctx.lineTo(sc[idx[k]][0], sc[idx[k]][1]); ctx.closePath(); ctx.fill();
      }
      // aristas: brillo (glow) en 3 pasadas, mas intenso donde la luz pega ("resalte")
      for (const pass of [[10 + dof * 24, 0.045], [3.2 + dof * 10, 0.12], [0.9 + dof * 3.2, 0.92]]) {
        if (S.low && pass[1] < 0.1) continue;
        ctx.lineWidth = pass[0] * (S.W < 600 ? 0.7 : 1);
        for (let k = 0; k < E.length; k++) {
          const fs = EF[k], rim = Math.max(lits[fs[0]] || 0, lits[fs[1]] || 0);
          const al = pass[1] * (0.45 + 0.55 * rim) * lerp(1, 0.5, dof) * (pass[1] > 0.5 ? 1 : glow);
          ctx.strokeStyle = `rgba(255,255,255,${al.toFixed(3)})`;
          ctx.beginPath(); ctx.moveTo(sc[E[k][0]][0], sc[E[k][0]][1]); ctx.lineTo(sc[E[k][1]][0], sc[E[k][1]][1]); ctx.stroke();
        }
      }
      // punto de luz en el vertice mas iluminado
      let bi = 0, bv = -9; V.forEach((v, i) => { const r = rot(v), s = -(r[0] * LIGHT[0] + r[1] * LIGHT[1] + r[2] * LIGHT[2]); if (s > bv) { bv = s; bi = i; } });
      const hp = sc[bi], hr = (6 + dof * 14) * (S.W < 600 ? 0.7 : 1), hg = ctx.createRadialGradient(hp[0], hp[1], 0, hp[0], hp[1], hr * 2.4);
      hg.addColorStop(0, `rgba(255,255,255,${(0.55 * sharp * glow + 0.08).toFixed(3)})`); hg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(hp[0], hp[1], hr * 2.4, 0, 6.283); ctx.fill();
    }

    // ---- eventos ---------------------------------------------------------------------------------------------
    S.mx_px = -9999; S.my_px = -9999;
    const onMove = ev => {
      const x = ev.clientX, y = ev.clientY;
      S.vx = x - (S.mx_px === -9999 ? x : S.mx_px); S.vy = y - (S.my_px === -9999 ? y : S.my_px);
      S.mx_px = x; S.my_px = y; S.mx = (x / S.W - 0.5) * 2; S.my = (y / S.H - 0.5) * 2; S.active = true; S.lastMove = performance.now();
      wake();
    };
    const onLeave = () => { S.active = false; S.mx = 0; S.my = 0; S.mx_px = S.my_px = -9999; };
    const wake = () => { if (!S.raf && !S.dead && !document.hidden && !rmq.matches) { S.last = 0; S.raf = requestAnimationFrame(frame); } };
    const onVis = () => { if (document.hidden) { cancelAnimationFrame(S.raf); S.raf = 0; } else wake(); };
    const onRm = () => { cancelAnimationFrame(S.raf); S.raf = 0; resize(); wake(); };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerleave', onLeave); document.documentElement.addEventListener('mouseleave', onLeave);
    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', onVis);
    rmq.addEventListener && rmq.addEventListener('change', onRm);

    resize();
    if (rmq.matches) { draw(0); S.ready = true; opts.onReady && opts.onReady(); } else S.raf = requestAnimationFrame(frame);

    // ayudas para pruebas / depuracion
    canvas.__takeCubes = S;
    return function dispose() {
      S.dead = true; cancelAnimationFrame(S.raf); S.raf = 0;
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerleave', onLeave);
      document.documentElement.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', onVis);
      rmq.removeEventListener && rmq.removeEventListener('change', onRm);
      delete canvas.__takeCubes;
      if (liquid) { liquid.remove(); liquid = null; }
    };
  }

  window.TakeCubes = { version: '1.0.0', mount };
  window.dispatchEvent(new Event('take-cubes-ready'));
})();
