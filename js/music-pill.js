/*
 * Pildora de musica (menu principal, arriba al centro).
 *
 *  - Muestra lo que suena en tu Discord/Spotify (nombre arriba y artista debajo) o, si no hay nada, la ultima de Last.fm (atenuada).
 *  - La cancion SUENA SOLA: con el primer click/toque/tecla en la pagina se busca el video en YouTube
 *    (/api/yt-search, YouTube Data API v3) y se reproduce con el IFrame Player en el mismo segundo que en Discord.
 *    Sin confirmacion y sin boton de "escuchar": el navegador solo exige ese primer gesto.
 *  - Se mantiene sincronizada cada segundo y cambia sola de cancion cuando cambia en Discord.
 *  - Click en la portada = silenciar / activar. Click en el texto = letra sincronizada (lrclib.net), una linea con rebote.
 *  - Mientras suena la cancion de Discord se pausa la musica ambiente del sitio (window.TakeAmbient) y vuelve cuando no hay nada.
 *
 * Es un singleton: vive en <body>, no depende de React, y no se desmonta al cambiar de panel, asi no se corta la musica.
 * Depende de window.TakePresence (js/presence.js). En el menu se oculta cuando hay un panel abierto (ver css/music-pill.css).
 * API: window.TakeMusic = { wantsAudio(), isPlaying() }
 */
(function () {
  "use strict";
  if (window.TakeMusic) return;
  var P = window.TakePresence;
  if (!P) return;

  var LRC_API = "https://lrclib.net/api";
  var LEAD_MS = 300; // el audio tarda un poco en arrancar: lo adelantamos
  var DRIFT_MS = 1200; // desfase maximo antes de corregir con seekTo
  var MUTE_KEY = "take:music:muted";
  var ICON = {
    note: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M12 3v10.55c-.59-.34-1.27-.55-2-.55c-2.21 0-4 1.79-4 4s1.79 4 4 4s4-1.79 4-4V7h4V3z"/></svg>',
    on: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02"/></svg>',
    off: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63m2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71M4.27 3L3 4.27L7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a9 9 0 0 0 3.69-1.81L19.73 21L21 19.73l-9-9zM12 4L9.91 6.09L12 8.18z"/></svg>',
  };

  // ---------- utilidades ----------
  function cleanTitle(name) {
    return String(name || "")
      .replace(/\s*[\(\[][^)\]]*(feat|ft\.|with|remaster|version|edit|live|mono|stereo)[^)\]]*[\)\]]/gi, "")
      .replace(/\s+-\s+(.*(remaster|version|edit|mono|stereo|single|live|bonus).*)$/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  function mainArtist(a) { return String(a || "").split(/[;,]/)[0].trim(); }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function getJson(url) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
  }
  function readMuted() { try { return localStorage.getItem(MUTE_KEY) === "1"; } catch (e) { return false; } }
  function writeMuted(v) { try { localStorage.setItem(MUTE_KEY, v ? "1" : "0"); } catch (e) { /* modo privado */ } }

  // ---------- letras (lrclib.net) ----------
  var lyricsCache = {};

  /** "[01:23.45] texto" -> [{ t: ms, text }] ordenado. Ignora etiquetas como [ar:...]. */
  function parseLrc(lrc) {
    var out = [];
    String(lrc || "").split(/\r?\n/).forEach(function (line) {
      var stamps = [];
      var text = line.replace(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g, function (_, m, s, f) {
        var frac = f ? Number((f + "00").slice(0, 3)) : 0;
        stamps.push(Number(m) * 60000 + Number(s) * 1000 + frac);
        return "";
      }).trim();
      stamps.forEach(function (t) { out.push({ t: t, text: text }); });
    });
    return out.sort(function (a, b) { return a.t - b.t; });
  }

  function pickLyrics(r) {
    if (!r) return null;
    var synced = r.syncedLyrics ? parseLrc(r.syncedLyrics) : [];
    if (synced.length) return { synced: synced, plain: r.plainLyrics || null };
    if (r.plainLyrics) return { synced: null, plain: r.plainLyrics };
    return null;
  }

  function fetchLyrics(track) {
    var key = track.artist + "|" + track.song;
    if (lyricsCache[key]) return lyricsCache[key];
    var artist = mainArtist(track.artist);
    var titles = [track.song];
    var clean = cleanTitle(track.song);
    if (clean && clean !== track.song) titles.push(clean);
    var dur = track.duration ? Math.round(track.duration / 1000) : 0;

    function exact(title) {
      var q = new URLSearchParams({ artist_name: artist, track_name: title });
      if (track.album) q.set("album_name", track.album);
      if (dur) q.set("duration", String(dur));
      return getJson(LRC_API + "/get?" + q).then(pickLyrics).catch(function () { return null; });
    }
    function search(title) {
      var q = new URLSearchParams({ artist_name: artist, track_name: title });
      return getJson(LRC_API + "/search?" + q).then(function (list) {
        if (!Array.isArray(list)) return null;
        // preferimos letra sincronizada y la duracion mas cercana
        list = list.slice().sort(function (a, b) {
          var sa = a.syncedLyrics ? 0 : 1, sb = b.syncedLyrics ? 0 : 1;
          if (sa !== sb) return sa - sb;
          return Math.abs((a.duration || 0) - dur) - Math.abs((b.duration || 0) - dur);
        });
        return pickLyrics(list[0]);
      }).catch(function () { return null; });
    }

    var p = titles.reduce(function (chain, title) {
      return chain.then(function (found) { return found || exact(title); });
    }, Promise.resolve(null)).then(function (found) {
      return titles.reduce(function (chain, title) {
        return chain.then(function (f) { return f || search(title); });
      }, Promise.resolve(found));
    });
    lyricsCache[key] = p;
    p.then(function (v) { if (!v) delete lyricsCache[key]; }); // no recordar fallos: se puede reintentar
    return p;
  }

  // ---------- YouTube IFrame API ----------
  var ytApi = null;
  function loadYouTube() {
    if (ytApi) return ytApi;
    ytApi = new Promise(function (resolve, reject) {
      if (window.YT && window.YT.Player) return resolve(window.YT);
      var prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () { if (prev) prev(); resolve(window.YT); };
      var s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.onerror = function () { ytApi = null; reject(new Error("youtube blocked")); };
      document.head.appendChild(s);
    });
    return ytApi;
  }

  // ---------- estado ----------
  var state = {
    live: null, // { song, artist, album, art, start, end, duration } desde Discord/Spotify
    last: null, // ultima cancion de Last.fm
    armed: false, // ya hubo un primer gesto del usuario (el navegador ya permite el audio)
    muted: readMuted(),
    playing: false,
    lyricsOpen: false,
    lyrics: null, // { synced, plain } | "loading" | "none"
    lyricsKey: "",
  };
  var yt = { player: null, ready: false, videoId: null, key: "", pending: false, calibrated: "" };
  var ambient = { skipped: false, paused: false }; // skipped: no arranco por la cancion; paused: la pausamos nosotros
  var lastLine = -2;
  var lastSecond = -1;

  // ---------- DOM ----------
  var root = el("div", "np-pill");
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", "Now playing");
  root.hidden = true;
  var cover = el("button", "np-pill-cover");
  cover.type = "button";
  var img = el("img", "np-pill-img");
  img.alt = "";
  img.decoding = "async";
  var fallback = el("span", "np-pill-fallback", ICON.note);
  var vol = el("span", "np-pill-vol", ICON.on);
  cover.append(img, fallback, vol);
  var text = el("button", "np-pill-text");
  text.type = "button";
  text.setAttribute("aria-pressed", "false");
  var tTitle = el("strong", "np-pill-title");
  var tArtist = el("span", "np-pill-artist");
  text.append(tTitle, tArtist);   // nombre arriba, artista debajo
  var eq = el("span", "np-eq", "<i></i><i></i><i></i>");
  eq.setAttribute("aria-hidden", "true");
  root.append(cover, text, eq);
  var lyricsBox = el("div", "np-pill-lyrics");
  lyricsBox.hidden = true;
  lyricsBox.setAttribute("aria-live", "off");
  var ytHost = el("div", "np-yt");
  ytHost.setAttribute("aria-hidden", "true");

  function mountDom() {
    document.body.append(root, lyricsBox, ytHost);
    // El snapshot de index.html no coincide con lo que pinta React y este vuelve a pintar el <body> entero al
    // hidratar (error #418), llevandose lo que no es suyo. Si pasa, se vuelve a colocar; el iframe de YouTube
    // se reinicia porque al sacarlo del documento el reproductor muere.
    new MutationObserver(function () {
      if (!root.isConnected || !lyricsBox.isConnected) document.body.append(root, lyricsBox);
      if (!ytHost.isConnected) {
        document.body.append(ytHost);
        yt.player = null; yt.ready = false; yt.calibrated = "";
        setPlaying(false);
        syncListen();
      }
    }).observe(document.body, { childList: true });
  }
  if (document.body) mountDom(); else document.addEventListener("DOMContentLoaded", mountDom);

  // ---------- datos ----------
  function current() { return state.live || state.last; }
  function elapsed() {
    var t = state.live;
    if (!t) return 0;
    var e = P.now() - t.start;
    return Math.max(0, Math.min(e, t.duration || e));
  }
  function trackKey() { var t = state.live; return t ? t.artist + "|" + t.song + "|" + t.start : ""; }

  function fromPresence(d) {
    var sp = d && d.spotify;
    if (d && d.listening_to_spotify && sp && sp.song) {
      return {
        song: sp.song, artist: sp.artist || "", album: sp.album || "", art: sp.albumArt || null,
        start: sp.startTimestamp || 0, end: sp.endTimestamp || 0,
        duration: sp.endTimestamp && sp.startTimestamp ? sp.endTimestamp - sp.startTimestamp : 0,
      };
    }
    return null;
  }

  function onPresence(d) {
    var prevKey = trackKey();
    state.live = fromPresence(d);
    if (prevKey !== trackKey()) {
      lastLine = -2;
      lastSecond = -1;
      yt.calibrated = "";
      if (state.lyricsOpen) loadLyrics();
      syncListen();
    }
    render();
  }

  function loadLast() {
    getJson("/api/lastfm?limit=1").then(function (r) {
      var t = r && r.tracks && r.tracks[0];
      if (t && t.name) {
        state.last = { song: t.name, artist: t.artist || "", album: t.album || "", art: t.image || null };
        render();
      }
    }).catch(function () { });
  }

  // ---------- pintado ----------
  function render() {
    var t = current();
    root.hidden = !t;
    if (!t) return;
    root.classList.toggle("is-live", !!state.live);
    root.classList.toggle("is-last", !state.live);
    root.classList.toggle("is-playing", state.playing && !state.muted);
    root.classList.toggle("is-muted", state.muted);
    tTitle.textContent = t.song;
    tArtist.textContent = mainArtist(t.artist) || t.artist;
    if (t.art) {
      if (img.getAttribute("src") !== t.art) img.src = t.art;
      img.hidden = false;
      fallback.hidden = true;
    } else {
      img.removeAttribute("src");
      img.hidden = true;
      fallback.hidden = false;
    }
    vol.innerHTML = state.muted ? ICON.off : ICON.on;
    cover.setAttribute("aria-label", state.muted ? "Unmute music" : "Mute music");
    cover.title = state.live ? (state.muted ? "unmute" : "mute") : "";
    cover.disabled = !state.live;
    text.setAttribute("aria-label", state.lyricsOpen ? "Hide lyrics" : "Show lyrics");
    text.title = state.live ? "lyrics" : "last played";
    if (!state.live) root.style.removeProperty("--np-progress");
  }

  function tick() {
    if (document.hidden) return;
    var t = state.live;
    if (!t) return;
    var e = elapsed();
    var sec = Math.floor(e / 1000);
    if (sec !== lastSecond) {
      lastSecond = sec;
      root.style.setProperty("--np-progress", t.duration ? Math.min(100, (e / t.duration) * 100).toFixed(1) + "%" : "0%");
    }
    if (state.lyricsOpen) renderLyrics(e);
  }
  setInterval(tick, 250);

  // ---------- letras ----------
  function loadLyrics() {
    var t = current();
    if (!t) return;
    var key = t.artist + "|" + t.song;
    if (state.lyricsKey === key && state.lyrics && state.lyrics !== "loading") { renderLyrics(elapsed()); return; }
    state.lyricsKey = key;
    state.lyrics = "loading";
    lastLine = -2;
    lyricsBox.innerHTML = '<p class="np-pill-status">finding the lyrics…</p>';
    fetchLyrics({ song: t.song, artist: t.artist, album: t.album, duration: t.duration }).then(function (found) {
      if (state.lyricsKey !== key) return;
      state.lyrics = found || "none";
      lastLine = -2;
      if (!found) lyricsBox.innerHTML = '<p class="np-pill-status">no lyrics found for this one.</p>';
      else renderLyrics(elapsed());
    });
  }

  function renderLyrics(ms) {
    var L = state.lyrics;
    if (!L || L === "loading" || L === "none") return;
    if (!L.synced || !state.live) {
      if (lastLine !== -3) {
        lyricsBox.innerHTML = '<p class="np-pill-status">' + (L.synced ? "lyrics follow the song while it’s playing." : "these lyrics aren’t synced.") + "</p>";
        lastLine = -3;
      }
      return;
    }
    var lines = L.synced;
    var idx = -1;
    for (var i = 0; i < lines.length; i++) { if (lines[i].t <= ms + 120) idx = i; else break; }
    if (idx === lastLine) return;
    lastLine = idx;
    lyricsBox.innerHTML = "";
    var now = lines[idx], next = lines[idx + 1];
    var a = el("p", "np-line is-active");
    a.textContent = (now && now.text) || "♪";
    lyricsBox.append(a);
    if (next && next.text) { var n = el("p", "np-line is-next"); n.textContent = next.text; lyricsBox.append(n); }
  }

  // ---------- audio (YouTube) ----------
  function setAmbient(hold) {
    var A = window.TakeAmbient;
    if (!A) return;
    try {
      if (hold) {
        if (A.isOn()) { A.pause(); ambient.paused = true; }
      } else if (ambient.paused || ambient.skipped) {
        ambient.paused = false;
        ambient.skipped = false;
        A.play().catch(function () { });
      }
    } catch (e) { /* sin ambiente: da igual */ }
  }

  function setPlaying(on) {
    if (state.playing === on) return;
    state.playing = on;
    if (on && !state.muted) setAmbient(true);
    render();
  }

  function pausePlayer() {
    try { if (yt.player && yt.ready) yt.player.pauseVideo(); } catch (e) { }
    setPlaying(false);
  }

  function failOpen() { // no hay audio de YouTube para esta cancion: que vuelva la musica ambiente
    setPlaying(false);
    setAmbient(false);
  }

  function resolveVideo() {
    var key = trackKey();
    if (!key || yt.pending || yt.key === key) return;
    yt.pending = true;
    getJson("/api/yt-search").then(function (r) {
      yt.pending = false;
      if (trackKey() !== key) { resolveVideo(); return; } // cambio de cancion mientras buscaba
      yt.key = key;
      if (!r || !r.video || !r.video.videoId) { yt.videoId = null; pausePlayer(); failOpen(); return; }
      yt.videoId = r.video.videoId;
      startPlayer();
    }).catch(function () {
      yt.pending = false;
      yt.key = key;
      pausePlayer();
      failOpen();
    });
  }

  function wantSeconds() { return (elapsed() + LEAD_MS) / 1000; }

  function applyMute() {
    try {
      if (!yt.player || !yt.ready) return;
      if (state.muted) yt.player.mute(); else { yt.player.unMute(); yt.player.setVolume(70); }
    } catch (e) { }
  }

  function startPlayer() {
    if (!state.armed || !yt.videoId || !state.live) return;
    var startAt = wantSeconds();
    if (yt.player && yt.ready) {
      yt.calibrated = "";
      yt.player.loadVideoById({ videoId: yt.videoId, startSeconds: startAt });
      applyMute();
      return;
    }
    if (yt.player) return; // todavia creandose
    loadYouTube().then(function (YT) {
      if (yt.player || !state.live) return;
      var holder = el("div");
      ytHost.innerHTML = "";
      ytHost.append(holder);
      yt.player = new YT.Player(holder, {
        width: "200", height: "200", videoId: yt.videoId,
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, fs: 0, modestbranding: 1, playsinline: 1, rel: 0, start: Math.floor(startAt) },
        events: {
          onReady: function (e) {
            yt.ready = true;
            try { applyMute(); e.target.seekTo(wantSeconds(), true); e.target.playVideo(); } catch (x) { }
          },
          onStateChange: function (e) {
            var st = e && e.data;
            if (st === 1) {
              setPlaying(true);
              // la primera vez que suena cada cancion: ajuste fino (el video tardo en cargar)
              if (yt.calibrated !== trackKey()) {
                yt.calibrated = trackKey();
                try {
                  var want = wantSeconds();
                  if (Math.abs(yt.player.getCurrentTime() - want) * 1000 > 400) yt.player.seekTo(want, true);
                } catch (x) { }
              }
            } else if (st === 0 || st === 2) {
              setPlaying(false);
            }
          },
          onError: function () { pausePlayer(); failOpen(); },
        },
      });
    }).catch(function () { yt.player = null; failOpen(); });
  }

  /** Cada segundo: mantiene el audio en el mismo segundo que Discord. */
  setInterval(function () {
    if (!state.armed || !yt.player || !yt.ready) return;
    var t = state.live;
    if (!t) { pausePlayer(); return; }
    try {
      var want = wantSeconds();
      if (t.duration && want * 1000 >= t.duration) { pausePlayer(); return; }
      var st = yt.player.getPlayerState();
      if (st !== 1 && st !== 3) { yt.player.seekTo(want, true); yt.player.playVideo(); return; }
      if (Math.abs(yt.player.getCurrentTime() - want) * 1000 > DRIFT_MS) yt.player.seekTo(want, true);
    } catch (e) { }
  }, 1000);

  function syncListen() {
    if (!state.armed) return;
    if (!state.live) { pausePlayer(); setAmbient(false); return; }
    resolveVideo();
  }

  // ---------- eventos ----------
  /** Primer gesto del usuario: desde aqui el navegador deja sonar. */
  function arm() {
    if (state.armed) return;
    state.armed = true;
    ["pointerdown", "keydown", "touchstart"].forEach(function (ev) { window.removeEventListener(ev, arm, true); });
    syncListen();
  }
  ["pointerdown", "keydown", "touchstart"].forEach(function (ev) { window.addEventListener(ev, arm, { capture: true, passive: true }); });

  cover.addEventListener("click", function () {
    if (!state.live) return;
    state.muted = !state.muted;
    writeMuted(state.muted);
    applyMute();
    render();
  });
  text.addEventListener("click", function () {
    state.lyricsOpen = !state.lyricsOpen;
    text.setAttribute("aria-pressed", String(state.lyricsOpen));
    root.classList.toggle("has-lyrics", state.lyricsOpen);
    lyricsBox.hidden = !state.lyricsOpen;
    if (state.lyricsOpen) { lastLine = -2; loadLyrics(); }
    render();
  });

  P.subscribe(onPresence);
  onPresence(P.get());
  loadLast();

  window.TakeMusic = {
    /** true si hay una cancion de Discord que va a sonar aqui: la musica ambiente no debe arrancar. */
    wantsAudio: function () {
      var want = !!state.live && !state.muted;
      if (want) ambient.skipped = true;
      return want;
    },
    isPlaying: function () { return state.playing; },
    _parseLrc: parseLrc,
    _cleanTitle: cleanTitle,
  };
})();
