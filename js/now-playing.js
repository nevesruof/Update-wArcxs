/*
 * Tarjeta "now playing" del about me.
 *
 *  - Muestra lo que suena en tu Discord/Spotify (con el segundo exacto) o, si no hay nada, la ultima cancion de Last.fm.
 *  - Boton del microfono: letra sincronizada (lrclib.net) con rebote, en el mismo segundo que tu Discord.
 *  - Boton de la portada: "listen along" -> reproduce la misma cancion en la pagina (YouTube IFrame API) en el mismo
 *    segundo. El video lo busca /api/yt-search con YOUTUBE_API_KEY (ver README).
 *
 * Uso: const destroy = window.TakeNowPlaying.mount(elemento, { onListen(activo) {} });
 * Depende de window.TakePresence (js/presence.js).
 */
(function () {
  "use strict";
  if (window.TakeNowPlaying) return;

  var LRC_API = "https://lrclib.net/api";
  var LEAD_MS = 300; // el audio tarda un poco en arrancar: lo adelantamos
  var DRIFT_MS = 1500; // desfase maximo antes de corregir con seekTo
  var ICON = {
    mic: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M9 3a4 4 0 0 1 4 4H5a4 4 0 0 1 4-4m2.84 6.82L11 18h-1v1a2 2 0 0 0 2 2a2 2 0 0 0 2-2v-5a4 4 0 0 1 4-4h2l-1 1l1 1h-2a2 2 0 0 0-2 2v5a4 4 0 0 1-4 4a4 4 0 0 1-4-4v-1H7l-.84-8.18C5.67 9.32 5.31 8.7 5.13 8h7.74c-.18.7-.54 1.32-1.03 1.82M9 11a1 1 0 0 0-1 1a1 1 0 0 0 1 1a1 1 0 0 0 1-1a1 1 0 0 0-1-1"/></svg>',
    play: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M8 5.14v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M14 19h4V5h-4M6 19h4V5H6z"/></svg>',
    note: '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="currentColor" d="M12 3v10.55c-.59-.34-1.27-.55-2-.55c-2.21 0-4 1.79-4 4s1.79 4 4 4s4-1.79 4-4V7h4V3z"/></svg>',
  };

  // ---------- utilidades ----------
  function fmt(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }
  var rtf = typeof Intl !== "undefined" && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat("en", { numeric: "auto" }) : null;
  function ago(ts) {
    var m = Math.floor((Date.now() - ts) / 6e4);
    if (m < 1) return "just now";
    if (!rtf) return m + " min ago";
    if (m < 60) return rtf.format(-m, "minute");
    var h = Math.floor(m / 60);
    if (h < 24) return rtf.format(-h, "hour");
    return rtf.format(-Math.floor(h / 24), "day");
  }
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

  // ---------- componente ----------
  function mount(root, opts) {
    opts = opts || {};
    var P = window.TakePresence;
    if (!P) return function () { };

    var state = {
      live: null, // { song, artist, album, art, start, end, duration } desde Discord/Spotify
      last: null, // ultima cancion de Last.fm
      lyricsOpen: false,
      lyrics: null, // { synced, plain } | "loading" | "none"
      lyricsKey: "",
      listening: false,
      note: "",
    };
    var destroyed = false;
    var raf = 0;
    var yt = { player: null, ready: false, videoId: null, key: "", pending: false, host: null };
    var lastLine = -2;
    var lastSecond = -1;

    root.classList.add("np");
    root.innerHTML = "";
    var card = el("div", "np-card");
    var cover = el("button", "np-cover");
    cover.type = "button";
    var img = el("img", "np-cover-img");
    img.alt = "";
    img.decoding = "async";
    var coverFallback = el("span", "np-cover-fallback", ICON.note);
    var coverBtn = el("span", "np-cover-btn", ICON.play);
    cover.append(img, coverFallback, coverBtn);
    var meta = el("div", "np-meta");
    var title = el("strong", "np-title");
    var artist = el("span", "np-artist");
    var timeRow = el("span", "np-time");
    var tiny = el("i", "np-tiny-dot");
    var timeText = el("span", "np-time-text");
    timeRow.append(tiny, timeText);
    var bar = el("div", "np-bar");
    var barFill = el("i");
    bar.append(barFill);
    meta.append(title, artist, timeRow, bar);
    var mic = el("button", "np-mic", ICON.mic);
    mic.type = "button";
    mic.setAttribute("aria-label", "Show lyrics");
    mic.setAttribute("aria-pressed", "false");
    mic.title = "lyrics";
    card.append(cover, meta, mic);
    var lyricsBox = el("div", "np-lyrics");
    lyricsBox.hidden = true;
    lyricsBox.setAttribute("aria-live", "off");
    var note = el("p", "np-note");
    note.hidden = true;
    root.append(card, lyricsBox, note);

    // contenedor del reproductor de YouTube (fuera de pantalla)
    var ytHost = el("div", "np-yt");
    ytHost.setAttribute("aria-hidden", "true");
    document.body.appendChild(ytHost);

    function current() { return state.live || state.last; }
    function elapsed() {
      var t = state.live;
      if (!t) return 0;
      var e = P.now() - t.start;
      return Math.max(0, Math.min(e, t.duration || e));
    }
    function setNote(text) {
      state.note = text || "";
      note.textContent = state.note;
      note.hidden = !state.note;
    }

    // --- datos ---
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
      var prev = state.live;
      state.live = fromPresence(d);
      var keyOf = function (t) { return t ? t.artist + "|" + t.song + "|" + t.start : ""; };
      if (keyOf(prev) !== keyOf(state.live)) {
        lastLine = -2;
        lastSecond = -1;
        if (state.lyricsOpen) loadLyrics();
        syncListen(true);
      }
      renderStatic();
    }

    function loadLast() {
      getJson("/api/lastfm?limit=1").then(function (r) {
        var t = r && r.tracks && r.tracks[0];
        if (t && t.name) {
          state.last = { song: t.name, artist: t.artist || "", album: t.album || "", art: t.image || null, date: t.date || 0, nowPlaying: !!t.nowPlaying };
          renderStatic();
        }
      }).catch(function () { });
    }

    // --- pintado ---
    function renderStatic() {
      if (destroyed) return;
      var t = current();
      card.classList.toggle("is-live", !!state.live);
      card.classList.toggle("is-empty", !t);
      if (!t) {
        title.textContent = "nothing playing right now";
        artist.textContent = "";
        timeText.textContent = "";
        tiny.hidden = true;
        img.removeAttribute("src");
        img.hidden = true;
        coverFallback.hidden = false;
        mic.disabled = true;
        return;
      }
      mic.disabled = false;
      title.textContent = t.song;
      artist.textContent = mainArtist(t.artist) || t.artist;
      if (t.art) {
        if (img.getAttribute("src") !== t.art) img.src = t.art;
        img.hidden = false;
        coverFallback.hidden = true;
      } else {
        img.removeAttribute("src");
        img.hidden = true;
        coverFallback.hidden = false;
      }
      tiny.hidden = false;
      if (!state.live) {
        timeText.textContent = t.nowPlaying ? "now playing" : (t.date ? "last played " + ago(t.date) : "last played");
        barFill.style.width = "0%";
      }
      cover.disabled = !state.live;
      cover.setAttribute("aria-label", state.live ? (state.listening ? "Stop listening along" : "Listen along") : "Listen along (only while I'm listening)");
      cover.title = state.live ? (state.listening ? "stop listening along" : "listen along") : "";
      coverBtn.innerHTML = state.listening ? ICON.pause : ICON.play;
      cover.classList.toggle("is-on", state.listening);
    }

    function tick() {
      if (destroyed) return;
      raf = requestAnimationFrame(tick);
      if (document.hidden) return;
      var t = state.live;
      if (!t) return;
      var e = elapsed();
      var sec = Math.floor(e / 1000);
      if (sec !== lastSecond) {
        lastSecond = sec;
        timeText.textContent = t.duration ? fmt(e) + " / " + fmt(t.duration) : fmt(e);
        barFill.style.width = t.duration ? Math.min(100, (e / t.duration) * 100).toFixed(1) + "%" : "0%";
      }
      if (state.lyricsOpen) renderLyrics(e);
    }

    // --- letras ---
    function loadLyrics() {
      var t = current();
      if (!t) return;
      var key = t.artist + "|" + t.song;
      if (state.lyricsKey === key && state.lyrics && state.lyrics !== "loading") return;
      state.lyricsKey = key;
      state.lyrics = "loading";
      lastLine = -2;
      lyricsBox.innerHTML = '<p class="np-lyrics-status">finding the lyrics…</p>';
      fetchLyrics({ song: t.song, artist: t.artist, album: t.album, duration: t.duration }).then(function (found) {
        if (destroyed || state.lyricsKey !== key) return;
        state.lyrics = found || "none";
        lastLine = -2;
        if (!found) lyricsBox.innerHTML = '<p class="np-lyrics-status">no lyrics found for this one.</p>';
        else if (!found.synced || !state.live) renderPlain(found);
        else renderLyrics(elapsed());
      });
    }

    function renderPlain(found) {
      lyricsBox.innerHTML = "";
      var pre = el("div", "np-lyrics-plain");
      var text = found.plain || (found.synced || []).map(function (l) { return l.text; }).join("\n");
      pre.textContent = text;
      lyricsBox.append(pre);
      lastLine = -3;
    }

    function renderLyrics(ms) {
      var L = state.lyrics;
      if (!L || L === "loading" || L === "none") return;
      if (!L.synced || !state.live) { if (lastLine !== -3) renderPlain(L); return; }
      var lines = L.synced;
      var idx = -1;
      for (var i = 0; i < lines.length; i++) { if (lines[i].t <= ms + 120) idx = i; else break; }
      if (idx === lastLine) return;
      lastLine = idx;
      lyricsBox.innerHTML = "";
      var slots = [-1, 0, 1, 2];
      slots.forEach(function (off) {
        var line = lines[idx + off];
        var cls = "np-line" + (off === 0 ? " is-active" : off < 0 ? " is-past" : " is-next");
        var node = el("p", cls);
        var txt = line ? line.text : "";
        node.textContent = txt || (off === 0 ? "♪" : " ");
        lyricsBox.append(node);
      });
    }

    // --- escuchar junto (YouTube) ---
    function destroyPlayer() {
      try { if (yt.player && yt.player.destroy) yt.player.destroy(); } catch (e) { }
      yt.player = null;
      yt.ready = false;
      yt.videoId = null;
      yt.key = "";
      ytHost.innerHTML = "";
    }

    function trackKey() { var t = state.live; return t ? t.artist + "|" + t.song + "|" + t.start : ""; }

    function resolveVideo() {
      var key = trackKey();
      if (!key || yt.pending || yt.key === key) return;
      yt.pending = true;
      setNote("finding the song…");
      getJson("/api/yt-search").then(function (r) {
        yt.pending = false;
        if (destroyed || !state.listening) return;
        if (trackKey() !== key) { resolveVideo(); return; } // cambio de cancion mientras buscaba
        yt.key = key;
        if (!r || !r.video || !r.video.videoId) { yt.videoId = null; setNote("couldn't find this one on youtube."); pausePlayer(); return; }
        yt.videoId = r.video.videoId;
        setNote("");
        startPlayer();
      }).catch(function (err) {
        yt.pending = false;
        yt.key = key;
        var m = String(err && err.message);
        setNote(m === "503" ? "listen along isn't set up yet." : m === "429" ? "listen along hit its daily limit." : "listen along isn't available right now.");
        pausePlayer();
      });
    }

    function startPlayer() {
      if (!state.listening || !yt.videoId) return;
      var startAt = (elapsed() + LEAD_MS) / 1000;
      if (yt.player && yt.ready) {
        yt.player.loadVideoById({ videoId: yt.videoId, startSeconds: startAt });
        return;
      }
      loadYouTube().then(function (YT) {
        if (destroyed || !state.listening || yt.player) return;
        var holder = el("div");
        ytHost.innerHTML = "";
        ytHost.append(holder);
        yt.player = new YT.Player(holder, {
          width: "200", height: "200", videoId: yt.videoId,
          playerVars: { autoplay: 1, controls: 0, disablekb: 1, fs: 0, modestbranding: 1, playsinline: 1, rel: 0, start: Math.floor(startAt) },
          events: {
            onReady: function (e) {
              yt.ready = true;
              try { e.target.setVolume(70); e.target.seekTo((elapsed() + LEAD_MS) / 1000, true); e.target.playVideo(); } catch (x) { }
            },
            onError: function () { setNote("youtube wouldn't play this one."); pausePlayer(); },
          },
        });
      }).catch(function () { setNote("youtube is blocked here."); setListening(false, true); });
    }

    function pausePlayer() {
      try { if (yt.player && yt.ready) yt.player.pauseVideo(); } catch (e) { }
    }

    /** Cada segundo: mantiene el audio en el mismo segundo que Discord. */
    var syncTimer = setInterval(function () {
      if (destroyed || !state.listening || !yt.player || !yt.ready) return;
      var t = state.live;
      if (!t) { pausePlayer(); return; }
      try {
        var want = (elapsed() + LEAD_MS) / 1000;
        if (t.duration && want * 1000 >= t.duration) { pausePlayer(); return; }
        var st = yt.player.getPlayerState();
        if (st !== 1 && st !== 3) { yt.player.seekTo(want, true); yt.player.playVideo(); return; }
        if (Math.abs(yt.player.getCurrentTime() - want) * 1000 > DRIFT_MS) yt.player.seekTo(want, true);
      } catch (e) { }
    }, 1000);

    function syncListen() {
      if (!state.listening) return;
      if (!state.live) { pausePlayer(); setNote("paused: nothing playing on my side right now."); return; }
      setNote("");
      resolveVideo();
    }

    function setListening(on, silent) {
      state.listening = !!on;
      if (opts.onListen && !silent) { try { opts.onListen(state.listening); } catch (e) { } }
      if (state.listening) {
        if (!state.live) { state.listening = false; setNote("nothing is playing right now — come back when I am."); renderStatic(); return; }
        yt.key = ""; // fuerza buscar para la cancion actual
        syncListen();
      } else {
        pausePlayer();
        setNote("");
      }
      renderStatic();
    }

    // --- eventos ---
    cover.addEventListener("click", function () { setListening(!state.listening); });
    mic.addEventListener("click", function () {
      state.lyricsOpen = !state.lyricsOpen;
      mic.setAttribute("aria-pressed", String(state.lyricsOpen));
      mic.setAttribute("aria-label", state.lyricsOpen ? "Hide lyrics" : "Show lyrics");
      mic.classList.toggle("is-on", state.lyricsOpen);
      lyricsBox.hidden = !state.lyricsOpen;
      if (state.lyricsOpen) { lastLine = -2; loadLyrics(); }
    });

    var unsub = P.subscribe(onPresence);
    onPresence(P.get());
    loadLast();
    raf = requestAnimationFrame(tick);

    return function destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      clearInterval(syncTimer);
      unsub();
      destroyPlayer();
      if (ytHost.parentNode) ytHost.parentNode.removeChild(ytHost);
      root.innerHTML = "";
    };
  }

  window.TakeNowPlaying = { mount: mount, _parseLrc: parseLrc, _cleanTitle: cleanTitle };
})();
