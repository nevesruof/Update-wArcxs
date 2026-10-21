/*! nowplaying.js - tarjeta "now playing" (arriba, en el menu) + letras sincronizadas con rebote + "escuchar a la par".
 *  TKWM-40632a5f-41f0-9fe6-22f804d522ac
 *  Datos: window.TakePresence.last (los publica la app desde /api/activity, que lee tu bot de Discord).
 *  - Tarjeta: portada, cancion, artista y el segundo exacto; boton circular con microfono -> letras.
 *  - Letras: /api/lyrics (LRCLIB). La linea activa rebota y cada palabra "salta" al cantarse, al mismo segundo que en Discord.
 *  - Escuchar a la par: /api/listen busca la cancion en YouTube (YOUTUBE_API_KEY en Vercel) y la reproduce con el
 *    reproductor oficial (IFrame API), visible (>=200x200, como exigen las condiciones de YouTube), en el mismo segundo.
 *  Ajuste fino: OFFSET_MS (+ adelanta las letras / el video, - las atrasa).
 */
(function () {
  'use strict';
  if (window.TakeNowPlaying) return;
  var OFFSET_MS = 0;
  var ICONS = {"microphone": "<path fill=\"currentColor\" d=\"M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3m7 9c0 3.53-2.61 6.44-6 6.93V21h-2v-3.07c-3.39-.49-6-3.4-6-6.93h2a5 5 0 0 0 5 5a5 5 0 0 0 5-5z\"/>", "headphones": "<path fill=\"currentColor\" d=\"M12 1c-5 0-9 4-9 9v7a3 3 0 0 0 3 3h3v-8H5v-2a7 7 0 0 1 7-7a7 7 0 0 1 7 7v2h-4v8h3a3 3 0 0 0 3-3v-7c0-5-4.03-9-9-9\"/>", "close": "<path fill=\"currentColor\" d=\"M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12z\"/>", "music-note": "<path fill=\"currentColor\" d=\"M12 3v10.55c-.59-.34-1.27-.55-2-.55c-2.21 0-4 1.79-4 4s1.79 4 4 4s4-1.79 4-4V7h4V3z\"/>", "stop": "<path fill=\"currentColor\" d=\"M18 18H6V6h12z\"/>", "alert-circle-outline": "<path fill=\"currentColor\" d=\"M11 15h2v2h-2zm0-8h2v6h-2zm1-5C6.47 2 2 6.5 2 12a10 10 0 0 0 10 10a10 10 0 0 0 10-10A10 10 0 0 0 12 2m0 18a8 8 0 0 1-8-8a8 8 0 0 1 8-8a8 8 0 0 1 8 8a8 8 0 0 1-8 8\"/>"};
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function el(tag, cls, attrs) { var e = document.createElement(tag); if (cls) e.className = cls; for (var k in (attrs || {})) e.setAttribute(k, attrs[k]); return e; }
  function svg(name, size) { var s = el('span', 'tk-i'); s.innerHTML = '<svg viewBox="0 0 24 24" width="' + (size || 20) + '" height="' + (size || 20) + '" fill="currentColor" aria-hidden="true" focusable="false">' + ICONS[name] + '</svg>'; return s; }
  function fmt(ms) { var s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function ago(ms) { var s = Math.max(0, Math.round((Date.now() - ms) / 1000)); if (s < 60) return 'just now'; var m = Math.floor(s / 60); if (m < 60) return m + (m === 1 ? ' minute ago' : ' minutes ago'); var h = Math.floor(m / 60); if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago'); var d = Math.floor(h / 24); return d + (d === 1 ? ' day ago' : ' days ago'); }
  function primaryArtist(a) { return String(a || '').split(/;|,|\s&\s/)[0].trim(); }

  var S = { data: null, track: null, key: '', open: false, lines: [], plain: null, idx: -2, loaded: '', listen: { state: 'idle', player: null, key: '', videoId: '', ambient: false, lastSync: 0, busy: false } };
  var root, card, art, title, artistEl, timeEl, bar, mic, ly, stage, list, msg, listenBtn, hint, yt, ytHost;

  // ---- DOM --------------------------------------------------------------------------------------------
  function build() {
    root = el('div', 'tk-np', { id: 'tk-np', hidden: '' });
    card = el('div', 'tk-np-card');
    art = el('img', 'tk-np-art', { alt: '', width: '60', height: '60', decoding: 'async', referrerpolicy: 'no-referrer' });
    art.addEventListener('error', function () { art.style.visibility = 'hidden'; });
    var text = el('div', 'tk-np-text');
    title = el('div', 'tk-np-title'); artistEl = el('div', 'tk-np-artist'); timeEl = el('div', 'tk-np-time');
    text.appendChild(title); text.appendChild(artistEl); text.appendChild(timeEl);
    mic = el('button', 'tk-np-mic', { type: 'button', 'aria-label': 'show lyrics', 'aria-pressed': 'false', title: 'lyrics' });
    mic.appendChild(svg('microphone', 20));
    mic.addEventListener('click', toggleLyrics);
    bar = el('div', 'tk-np-bar'); bar.appendChild(el('i'));
    card.appendChild(art); card.appendChild(text); card.appendChild(mic); card.appendChild(bar);
    root.appendChild(card);

    ly = el('div', 'tk-ly', { id: 'tk-ly', role: 'dialog', 'aria-label': 'lyrics', hidden: '' });
    stage = el('div', 'tk-ly-stage'); list = el('div', 'tk-ly-list'); stage.appendChild(list);
    msg = el('div', 'tk-ly-msg');
    var ctl = el('div', 'tk-ly-controls');
    listenBtn = el('button', 'tk-ly-listen', { type: 'button' });
    listenBtn.addEventListener('click', onListen);
    hint = el('div', 'tk-ly-hint');
    ctl.appendChild(listenBtn); ctl.appendChild(hint);
    ly.appendChild(stage); ly.appendChild(msg); ly.appendChild(ctl);

    yt = el('div', 'tk-yt', { hidden: '' });
    ytHost = el('div', 'tk-yt-host', { id: 'tk-yt-player' });
    var stop = el('button', 'tk-yt-stop', { type: 'button', 'aria-label': 'stop listening along', title: 'stop' }); stop.appendChild(svg('close', 16));
    stop.addEventListener('click', stopListen);
    yt.appendChild(stop); yt.appendChild(ytHost);

    document.body.appendChild(ly); document.body.appendChild(yt); document.body.appendChild(root);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S.open) toggleLyrics(); });
    renderListenBtn();
  }

  // ---- datos ------------------------------------------------------------------------------------------
  function pick(d) {
    if (!d) return null;
    var sp = d.spotify, r = d.recent_track;
    if (sp && sp.song) return { live: true, song: sp.song, artist: sp.artist || '', album: sp.album || '', art: sp.albumArt, dur: sp.durationMs || 0, id: (sp.trackId || sp.song + '|' + sp.artist) };
    if (r && r.song) return { live: false, song: r.song, artist: r.artist || '', album: r.album || '', art: r.albumArt, dur: r.durationMs || 0, id: (r.trackId || r.song + '|' + r.artist), endedAt: r.endedAt };
    return null;
  }
  /** Segundo exacto (ms): lo calculado en el servidor + edad de la respuesta + tiempo local transcurrido. */
  function position(now) {
    var d = S.data, sp = d && d.spotify; if (!sp || sp.positionMs == null) return null;
    var p = sp.positionMs + (d.__age || 0) * 1000 + (now - (d.__recv || now));
    if (sp.durationMs) p = Math.min(p, sp.durationMs);
    return Math.max(0, p + OFFSET_MS);
  }

  function onData(d) {
    S.data = d; var t = pick(d), changed = !t || !S.track || t.id !== S.track.id;
    S.track = t;
    if (!t) { root.hidden = true; if (S.open) toggleLyrics(); return; }
    if (changed) {
      title.textContent = t.song; artistEl.textContent = t.artist;
      art.style.visibility = ''; if (t.art && /^https:\/\//.test(t.art)) art.src = t.art; else art.removeAttribute('src');
      S.idx = -2; S.loaded = ''; resetLyrics();
      if (S.open) loadLyrics();
    }
    tick();
  }

  // ---- tarjeta ----------------------------------------------------------------------------------------
  function panelOpen() { return !!document.querySelector('.home-screen--panel'); }
  function tick() {
    if (!root) return;
    var t = S.track;
    if (!t || panelOpen()) { root.hidden = true; if (S.open && panelOpen()) toggleLyrics(); return; }
    root.hidden = false;
    var now = Date.now(), p = t.live ? position(now) : null;
    if (t.live && p != null) { timeEl.textContent = fmt(p) + (t.dur ? ' / ' + fmt(t.dur) : ''); bar.firstChild.style.transform = 'scaleX(' + (t.dur ? Math.min(1, p / t.dur) : 0) + ')'; bar.hidden = !t.dur; }
    else { timeEl.textContent = t.endedAt ? 'last played ' + ago(t.endedAt) : 'last played'; bar.hidden = true; }
    mic.disabled = false;
    if (S.open) syncLyrics(p, now);
    if (S.listen.state === 'on') syncVideo(p, now);
  }

  // ---- letras -----------------------------------------------------------------------------------------
  function toggleLyrics() {
    S.open = !S.open; ly.hidden = !S.open; mic.setAttribute('aria-pressed', String(S.open)); mic.classList.toggle('is-on', S.open);
    document.documentElement.classList.toggle('tk-ly-open', S.open);
    if (S.open) { loadLyrics(); S.idx = -2; tick(); }
  }
  function resetLyrics() { list.innerHTML = ''; list.style.transform = ''; S.lines = []; S.plain = null; msg.textContent = ''; }
  function loadLyrics() {
    var t = S.track; if (!t || S.loaded === t.id) return; S.loaded = t.id; resetLyrics(); msg.textContent = 'loading lyrics...';
    var q = 'artist=' + encodeURIComponent(primaryArtist(t.artist)) + '&track=' + encodeURIComponent(t.song) + '&album=' + encodeURIComponent(t.album || '') + '&duration=' + Math.round((t.dur || 0) / 1000);
    var id = t.id;
    fetch('/api/lyrics?' + q).then(function (r) { if (!r.ok) throw new Error('lyrics ' + r.status); return r.json(); }).then(function (j) {
      if (!S.track || S.track.id !== id) return;
      if (!j.found) { msg.textContent = 'no lyrics found for this song'; return; }
      if (j.instrumental && !(j.synced && j.synced.length)) { msg.textContent = 'instrumental'; return; }
      if (j.synced && j.synced.length) { msg.textContent = ''; renderSynced(j.synced); }
      else if (j.plain && j.plain.length) { msg.textContent = "synced lyrics aren't available for this one"; renderPlain(j.plain); }
      else msg.textContent = 'no lyrics found for this song';
      S.idx = -2; tick();
    }).catch(function () { if (S.track && S.track.id === id) { S.loaded = ''; msg.textContent = "couldn't load the lyrics right now"; } });
  }
  function renderSynced(lines) {
    S.lines = lines.map(function (l, i) {
      var p = el('p', 'tk-l'); p.dataset.i = i; var words = [];
      if (!l.text) { p.className += ' tk-l--gap'; var d = el('span', 'tk-dots'); d.innerHTML = '<i></i><i></i><i></i>'; p.appendChild(d); }
      else l.text.split(' ').forEach(function (w, k, arr) { var s = el('span', 'tk-w'); s.textContent = w; p.appendChild(s); if (k < arr.length - 1) p.appendChild(document.createTextNode(' ')); words.push(s); });
      list.appendChild(p); return { t: l.t, text: l.text, p: p, words: words, sung: 0 };
    });
  }
  function renderPlain(lines) { S.plain = lines; stage.classList.add('is-plain'); lines.forEach(function (t) { var p = el('p', 'tk-l tk-l--plain'); p.textContent = t || '\u00a0'; list.appendChild(p); }); }

  function findIdx(p) { var a = S.lines, lo = 0, hi = a.length - 1, r = -1; while (lo <= hi) { var m = (lo + hi) >> 1; if (a[m].t <= p) { r = m; lo = m + 1; } else hi = m - 1; } return r; }
  function syncLyrics(p, now) {
    stage.classList.toggle('is-plain', !!S.plain);
    if (!S.lines.length || p == null) return;
    var idx = findIdx(p), L = S.lines;
    if (idx !== S.idx) {
      var prev = S.idx; S.idx = idx;
      for (var i = 0; i < L.length; i++) {
        var d = Math.min(4, Math.abs(i - idx)), c = L[i].p;
        c.dataset.d = String(d); c.classList.toggle('is-active', i === idx); c.classList.toggle('is-past', i < idx);
        if (i !== idx) { L[i].sung = i < idx ? L[i].words.length : 0; L[i].words.forEach(function (w) { w.classList.remove('sung', 'pop'); }); }
      }
      if (idx >= 0) { var a = L[idx]; a.sung = 0; a.words.forEach(function (w) { w.classList.remove('sung', 'pop'); }); if (!reduce) { a.p.classList.remove('bounce'); void a.p.offsetWidth; a.p.classList.add('bounce'); } }
      var target = L[Math.max(0, idx)].p;
      var y = stage.clientHeight / 2 - (target.offsetTop + target.offsetHeight / 2);
      list.style.transform = 'translateY(' + y + 'px)';
    }
    if (idx >= 0) {   // palabra por palabra: reparte la duracion de la linea segun el largo de cada palabra
      var a2 = L[idx], end = idx + 1 < L.length ? L[idx + 1].t : a2.t + 4000, dur = Math.min(Math.max(end - a2.t, 600), 7000) * 0.9, total = 0, acc = 0;
      a2.words.forEach(function (w) { total += w.textContent.length + 1; });
      a2.words.forEach(function (w, k) {
        acc += (w.textContent.length + 1); var at = a2.t + dur * ((acc - (w.textContent.length + 1)) / (total || 1));
        if (p >= at && !w.classList.contains('sung')) { w.classList.add('sung'); if (!reduce) { w.classList.remove('pop'); void w.offsetWidth; w.classList.add('pop'); } }
      });
    }
  }

  // ---- escuchar a la par (YouTube) ----------------------------------------------------------------------
  var ytReady = null;
  function loadYT() {
    if (ytReady) return ytReady;
    ytReady = new Promise(function (res, rej) {
      if (window.YT && window.YT.Player) return res();
      var prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () { try { prev && prev(); } catch (e) {} res(); };
      var s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.async = true; s.onerror = function () { ytReady = null; rej(new Error('yt')); };
      document.head.appendChild(s);
    });
    return ytReady;
  }
  function renderListenBtn() {
    var st = S.listen.state; listenBtn.innerHTML = ''; listenBtn.classList.toggle('is-on', st === 'on'); listenBtn.disabled = st === 'loading';
    listenBtn.appendChild(svg('headphones', 18));
    listenBtn.appendChild(document.createTextNode(st === 'on' ? 'listening along' : st === 'loading' ? 'finding the song...' : 'listen along'));
    listenBtn.setAttribute('aria-pressed', String(st === 'on'));
    document.documentElement.classList.toggle('tk-listening', st === 'on');
  }
  function say(t) { hint.textContent = t || ''; }
  function onListen() { if (S.listen.state === 'on') return stopListen(); startListen(); }

  function startListen() {
    var t = S.track; if (!t || !t.live) { say("i'm not listening to anything right now"); return; }
    S.listen.state = 'loading'; renderListenBtn(); say('');
    S.listen.busy = true;
    findVideo(t).then(function (v) {
      if (!v) { S.listen.state = 'idle'; renderListenBtn(); return; }
      return loadYT().then(function () { return mountPlayer(v, t); });
    }).catch(function () { S.listen.state = 'idle'; renderListenBtn(); say("couldn't reach youtube"); }).then(function () { S.listen.busy = false; });
  }
  function findVideo(t) {
    return fetch('/api/listen?artist=' + encodeURIComponent(primaryArtist(t.artist)) + '&track=' + encodeURIComponent(t.song) + '&duration=' + Math.round((t.dur || 0) / 1000))
      .then(function (r) { return r.json(); }).then(function (v) {
        if (!v.enabled) { say("listening along isn't set up yet"); return null; }
        if (!v.videoId) { say(v.reason === 'quota' ? 'youtube is busy right now, try later' : "couldn't find this song on youtube"); return null; }
        if (!v.ok) { say('youtube only has a different version of this song'); return null; }
        return v;
      });
  }
  function mountPlayer(v, t) {
    var p = position(Date.now()) || 0;
    S.listen.key = t.id; S.listen.videoId = v.videoId;
    if (TakeAmbientPlaying()) { S.listen.ambient = true; try { window.TakeAmbient.pause(); } catch (e) {} } else S.listen.ambient = false;
    yt.hidden = false;
    if (S.listen.player) { S.listen.player.loadVideoById({ videoId: v.videoId, startSeconds: p / 1000 }); S.listen.state = 'on'; renderListenBtn(); return; }
    S.listen.player = new window.YT.Player('tk-yt-player', {
      width: 200, height: 200, videoId: v.videoId,
      playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1, iv_load_policy: 3, start: Math.floor(p / 1000) },
      events: {
        onReady: function (e) { var q = position(Date.now()) || 0; e.target.seekTo(q / 1000, true); e.target.playVideo(); S.listen.state = 'on'; renderListenBtn(); say(''); },
        onError: function () { say("youtube won't play this one here"); stopListen(); },
      },
    });
  }
  function TakeAmbientPlaying() { try { return !!(window.TakeAmbient && window.TakeAmbient.isPlaying()); } catch (e) { return false; } }

  function syncVideo(p, now) {
    var L = S.listen, pl = L.player, t = S.track; if (!pl || !pl.getCurrentTime || L.busy) return;
    if (!t || !t.live || p == null) { try { pl.pauseVideo(); } catch (e) {} say('waiting for the next song...'); return; }
    if (t.id !== L.key) { L.key = t.id; L.busy = true; findVideo(t).then(function (v) { if (v) { L.videoId = v.videoId; pl.loadVideoById({ videoId: v.videoId, startSeconds: (position(Date.now()) || 0) / 1000 }); say(''); } else { try { pl.pauseVideo(); } catch (e) {} } }).catch(function () {}).then(function () { L.busy = false; }); return; }
    if (now - L.lastSync < 1000) return; L.lastSync = now;
    var st = pl.getPlayerState && pl.getPlayerState();
    if (st === 1) { var cur = pl.getCurrentTime() * 1000; if (Math.abs(cur - p) > 1500) pl.seekTo(p / 1000, true); }
    else if (st === 2 || st === 5 || st === -1 || st === 0) { try { pl.seekTo(p / 1000, true); pl.playVideo(); } catch (e) {} }
  }
  function stopListen() {
    var L = S.listen;
    try { if (L.player && L.player.destroy) L.player.destroy(); } catch (e) {}
    L.player = null; L.state = 'idle'; L.key = ''; L.videoId = '';
    var host = document.getElementById('tk-yt-player'); if (!host) { yt.appendChild(ytHost = el('div', 'tk-yt-host', { id: 'tk-yt-player' })); }
    yt.hidden = true; renderListenBtn(); say('');
    if (L.ambient) { try { window.TakeAmbient.play(); } catch (e) {} L.ambient = false; }
  }

  // ---- arranque ---------------------------------------------------------------------------------------
  function init() {
    if (root) return; build();
    window.addEventListener('take-presence', function (e) { onData(e.detail); });
    if (window.TakePresence && window.TakePresence.last) onData(window.TakePresence.last);
    setInterval(function () { if (!document.hidden) tick(); }, 250);
  }
  window.TakeNowPlaying = { init: init, _state: S, _position: position, _parse: null };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
