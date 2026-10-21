"use strict";
// node --test tests/nowplaying.test.js   (todo con datos de relleno inventados; no hay letras reales)
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseLrc, pickBest, lookupLyrics } = require("../api/_lib/lyrics");
const { parseIsoDuration, score, findVideo } = require("../api/_lib/youtube");
const { toPresence, offlinePresence, lastOnlineAt, recentTrack } = require("../api/_lib/bot");
const lyricsHandler = require("../api/lyrics");
const listenHandler = require("../api/listen");

// ---- helpers --------------------------------------------------------------------------------------------
const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
function call(handler, query = {}, method = "GET", ...extra) {
  return new Promise((resolve) => {
    const out = { headers: {}, status: 0, body: null };
    const res = { setHeader: (k, v) => { out.headers[k.toLowerCase()] = v; }, status(c) { out.status = c; return res; }, json(b) { out.body = b; resolve(out); return res; } };
    handler({ method, query }, res, ...extra);
  });
}

// ---- LRC ------------------------------------------------------------------------------------------------
test("parseLrc: tiempos en ms, varias marcas por linea, etiquetas ignoradas y orden", () => {
  const lines = parseLrc("[ar:Alguien]\n[ti:Prueba]\n[00:05.50] linea cinco\n[00:01.00][00:09.250] coro de prueba\n[01:02.5] fin\nsin tiempo\n[00:03] <00:03.10> con palabras <00:03.40> sueltas");
  assert.deepEqual(lines.map((l) => l.t), [1000, 3000, 5500, 9250, 62500]);
  assert.equal(lines[0].text, "coro de prueba");
  assert.equal(lines[1].text, "con palabras sueltas");
  assert.equal(lines.at(-1).text, "fin");
  assert.deepEqual(parseLrc(null), []);
  assert.equal(parseLrc("[00:01.000] a\n".repeat(900)).length, 400);   // tope de lineas
});

test("pickBest: prefiere sincronizada y duracion cercana; descarta lo muy distinto", () => {
  const a = { id: 1, duration: 200, syncedLyrics: "[00:01.00] x" }, b = { id: 2, duration: 203, syncedLyrics: "[00:01.00] y" }, c = { id: 3, duration: 201, plainLyrics: "z" };
  assert.equal(pickBest([c, b, a], 201).id, 1);
  assert.equal(pickBest([c], 201).id, 3);
  assert.equal(pickBest([{ duration: 400, syncedLyrics: "[00:01.00] x" }], 200), null);
  assert.equal(pickBest([], 200), null);
  assert.equal(pickBest(null, 200), null);
});

test("lookupLyrics: /get, luego /search, y sin resultado", async () => {
  const seen = [];
  const f1 = async (url, opts) => { seen.push(url); assert.match(opts.headers["User-Agent"], /^take-site/); return json({ syncedLyrics: "[00:02.00] uno\n[00:04.00] dos", duration: 180 }); };
  const r1 = await lookupLyrics({ artist: "Artista", track: "Tema", album: "Disco", durationSec: 180.4 }, f1);
  assert.equal(r1.found, true); assert.equal(r1.synced.length, 2); assert.equal(r1.plain, null);
  assert.match(seen[0], /\/get\?artist_name=Artista&track_name=Tema&album_name=Disco&duration=180/);

  const f2 = async (url) => (url.includes("/get?") ? json({}, 404) : json([{ duration: 181, plainLyrics: "a\nb" }, { duration: 180, syncedLyrics: "[00:01.00] s" }]));
  const r2 = await lookupLyrics({ artist: "A", track: "T", durationSec: 180 }, f2);
  assert.equal(r2.synced[0].text, "s");

  const f3 = async () => json({}, 404);
  assert.deepEqual(await lookupLyrics({ artist: "A", track: "T" }, f3), { found: false });
  const f4 = async () => json({}, 500);
  await assert.rejects(() => lookupLyrics({ artist: "A", track: "T" }, f4));
  const f5 = async (url) => (url.includes("/get?") ? json({ plainLyrics: "x\ny", duration: 100 }) : json([]));
  assert.deepEqual((await lookupLyrics({ artist: "A", track: "T" }, f5)).plain, ["x", "y"]);
});

test("/api/lyrics: 400 sin datos, 405 en POST, cache, 502 si falla", async () => {
  lyricsHandler._memo.clear();
  assert.equal((await call(lyricsHandler, {})).status, 400);
  assert.equal((await call(lyricsHandler, { artist: "A", track: "T" }, "POST")).status, 405);
  let n = 0;
  const ok = async () => { n++; return json({ syncedLyrics: "[00:01.00] hola de prueba" }); };
  const a = await call(lyricsHandler, { artist: "A", track: "T", duration: "200" }, "GET", ok);
  const b = await call(lyricsHandler, { artist: "a", track: "t", duration: "200" }, "GET", ok);
  assert.equal(a.status, 200); assert.equal(a.body.synced[0].text, "hola de prueba"); assert.match(a.headers["cache-control"], /s-maxage=86400/);
  assert.equal(n, 1); assert.equal(b.status, 200);                       // segunda vez sale de la memoria
  lyricsHandler._memo.clear();
  const bad = await call(lyricsHandler, { artist: "A", track: "T" }, "GET", async () => { throw new Error("red"); });
  assert.equal(bad.status, 502); assert.equal(bad.headers["cache-control"], "no-store");
});

// ---- YouTube --------------------------------------------------------------------------------------------
test("parseIsoDuration", () => {
  assert.equal(parseIsoDuration("PT3M45S"), 225); assert.equal(parseIsoDuration("PT1H2M3S"), 3723);
  assert.equal(parseIsoDuration("PT45S"), 45); assert.equal(parseIsoDuration("P0D"), 0); assert.equal(parseIsoDuration("raro"), null);
});

test("score: Topic gana a version rara aunque dure igual", () => {
  const topic = { title: "Tema", channel: "Artista - Topic", durationSec: 200 };
  const live = { title: "Tema (Live)", channel: "Otro", durationSec: 200 };
  assert.ok(score(topic, 200, "Tema") < score(live, 200, "Tema"));
  assert.ok(score(live, 200, "Tema (Live)") < score(live, 200, "Tema"));   // si la pista ya es "live", no se penaliza
});

function ytFetch(calls, { search, videos, status } = {}) {
  return async (url) => {
    calls.push(url);
    if (status) return json({}, status);
    return url.includes("/search?") ? json(search) : json(videos);
  };
}
const SEARCH = { items: [{ id: { videoId: "aaa" } }, { id: { videoId: "bbb" } }, { id: { videoId: "ccc" } }] };
const VIDEOS = { items: [
  { id: "aaa", snippet: { title: "Tema (Live)", channelTitle: "Fan" }, contentDetails: { duration: "PT4M10S" }, status: { embeddable: true } },
  { id: "bbb", snippet: { title: "Tema", channelTitle: "Artista - Topic" }, contentDetails: { duration: "PT3M21S" }, status: { embeddable: true } },
  { id: "ccc", snippet: { title: "Tema", channelTitle: "Sello" }, contentDetails: { duration: "PT3M20S" }, status: { embeddable: false } },
] };

test("findVideo: sin llave = desactivado; con llave elige el mejor y marca ok por duracion", async () => {
  assert.deepEqual(await findVideo({ artist: "A", track: "Tema", durationSec: 200 }, {}), { enabled: false });
  const calls = [];
  const r = await findVideo({ artist: "Artista", track: "Tema", durationSec: 200 }, { YOUTUBE_API_KEY: "LLAVE-SECRETA" }, ytFetch(calls, { search: SEARCH, videos: VIDEOS }));
  assert.equal(r.videoId, "bbb"); assert.equal(r.ok, true); assert.equal(r.diffSec, 1);
  assert.match(calls[0], /\/search\?.*videoEmbeddable=true.*q=Artista\+-\+Tema/);
  assert.match(calls[1], /\/videos\?.*id=aaa%2Cbbb%2Cccc/);
  assert.equal(JSON.stringify(r).includes("LLAVE-SECRETA"), false);
  const far = await findVideo({ artist: "A", track: "Tema", durationSec: 260 }, { YOUTUBE_API_KEY: "k" }, ytFetch([], { search: SEARCH, videos: VIDEOS }));
  assert.equal(far.ok, false);                                       // distinta version: no se sincroniza
  const none = await findVideo({ artist: "A", track: "T", durationSec: 1 }, { YOUTUBE_API_KEY: "k" }, ytFetch([], { search: { items: [] } }));
  assert.equal(none.videoId, null);
});

test("/api/listen: sin llave, cuota agotada y la llave nunca sale en la respuesta", async () => {
  listenHandler._memo.clear();
  const off = await call(listenHandler, { artist: "A", track: "T" }, "GET", fetch, {});
  assert.deepEqual(off.body, { enabled: false });
  const env = { YOUTUBE_API_KEY: "LLAVE-SECRETA" };
  assert.equal((await call(listenHandler, {}, "GET", fetch, env)).status, 400);
  const quota = await call(listenHandler, { artist: "A", track: "T", duration: "200" }, "GET", ytFetch([], { status: 403 }), env);
  assert.equal(quota.status, 200); assert.equal(quota.body.reason, "quota"); assert.equal(JSON.stringify(quota).includes("LLAVE-SECRETA"), false);
  const good = await call(listenHandler, { artist: "Artista", track: "Tema", duration: "200" }, "GET", ytFetch([], { search: SEARCH, videos: VIDEOS }), env);
  assert.equal(good.body.videoId, "bbb"); assert.match(good.headers["cache-control"], /s-maxage=86400/);
});

// ---- presencia ------------------------------------------------------------------------------------------
const profile = { id: "1", username: "u", global_name: "U", avatar: "abc" };
const song = (extra = {}) => ({ kind: "spotify", type: 2, name: "Tema", artist: "Artista", album: "Disco", image: "https://i/x", url: "https://open.spotify.com/track/1", trackId: "1", startMs: Date.now() - 83000, endMs: Date.now() + 120000, firstSeen: 1700000000, lastSeen: 1700000900, active: true, ...extra });

test("presencia: posicion en el servidor, duracion, reloj y ultima cancion", () => {
  const p = toPresence({ discord: { status: "online", activities: [song()] }, profile, recentSongs: [song()] });
  assert.ok(Math.abs(p.spotify.positionMs - 83000) < 1500);
  assert.ok(Math.abs(p.spotify.durationMs - 203000) < 50);
  assert.equal(p.spotify.trackId, "1"); assert.equal(p.last_online_at, null);
  assert.ok(Math.abs(p.now - Date.now()) < 1500);
  assert.equal(p.recent_track.song, "Tema");
});

test("presencia: offline trae 'ultima vez activo' del historial de estados", () => {
  const raw = { discord: { status: "offline" }, profile, recentStatuses: [
    { name: "offline", firstSeen: 1700001000, lastSeen: 1700002000, active: true },
    { name: "idle", firstSeen: 1700000500, lastSeen: 1700000990, active: false },
    { name: "online", firstSeen: 1700000000, lastSeen: 1700000400, active: false } ] };
  assert.equal(lastOnlineAt(raw), 1700000990 * 1000);
  const p = toPresence(raw);
  assert.equal(p.discord_status, "offline"); assert.equal(p.last_online_at, 1700000990 * 1000);
  assert.equal(offlinePresence(profile, null).last_online_at, null);
  assert.equal(lastOnlineAt({ recentStatuses: [{ name: "offline", lastSeen: 5 }] }), null);
  assert.equal(recentTrack({ recentSongs: [] }), null);
  assert.equal(recentTrack({ recentSongs: [song({ active: false })] }).active, false);
});
