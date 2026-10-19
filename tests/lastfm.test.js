"use strict";
// node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { toTracks, toTopArtist, pickImage } = require("../api/_lib/lastfm");

const img = (u) => ["small", "medium", "large", "extralarge"].map((size) => ({ size, "#text": u }));
const PLACE = "https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png";
const recent = {
  recenttracks: {
    track: [
      { name: "Now", artist: { "#text": "Uno", mbid: "" }, album: { "#text": "Alb" }, image: img("https://img/now.jpg"), url: "https://last.fm/n", "@attr": { nowplaying: "true" } },
      { name: "Old", artist: { "#text": "Dos" }, album: { "#text": "" }, image: img(PLACE), url: "u", date: { uts: "1700000000", "#text": "x" } },
      { name: "Old2", artist: { "#text": "Uno" }, album: { "#text": "Alb" }, image: img("https://img/old2.jpg"), date: { uts: "1699999000" } },
    ],
  },
};

test("tracks: nowPlaying, fecha en ms, portada placeholder => null, limit", () => {
  const t = toTracks(recent, 20).tracks;
  assert.equal(t.length, 3);
  assert.equal(t[0].nowPlaying, true);
  assert.equal(t[0].date, null);
  assert.equal(t[0].image, "https://img/now.jpg");
  assert.equal(t[1].nowPlaying, false);
  assert.equal(t[1].date, 1700000000000);
  assert.equal(t[1].image, null);
  assert.equal(t[1].album, null);
  assert.equal(toTracks(recent, "2").tracks.length, 2);
  assert.deepEqual(toTracks({}, 20), { tracks: [] });
  assert.equal(toTracks({ recenttracks: { track: recent.recenttracks.track[0] } }, 20).tracks.length, 1); // limit=1 => objeto
  assert.equal(pickImage(undefined), null);
});

test("top artist: nombre de Last.fm y portada de su cancion reciente", () => {
  const top = { topartists: { artist: [{ name: "Uno" }] } };
  assert.deepEqual(toTopArtist(top, toTracks(recent, 50)), { artist: "Uno", image: "https://img/now.jpg" });
  assert.deepEqual(toTopArtist(top, null), { artist: "Uno", image: null });
  assert.deepEqual(toTopArtist({ topartists: { artist: [] } }, null), {});
});

// --- handlers contra un Last.fm falso -------------------------------------------------------
function fake(handler) {
  return new Promise((resolve) => { const s = http.createServer(handler).listen(0, "127.0.0.1", () => resolve(s)); });
}
function call(mod, query = {}, method = "GET") {
  return new Promise((resolve) => {
    const out = { headers: {}, status: 200, body: null };
    const res = { setHeader: (k, v) => { out.headers[k.toLowerCase()] = v; }, status(c) { out.status = c; return res; }, json(b) { out.body = b; resolve(out); return res; } };
    mod({ method, query }, res);
  });
}
async function withEnv(env, fn) {
  const old = {};
  for (const k of Object.keys(env)) { old[k] = process.env[k]; if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
  try { await fn(); } finally { for (const k of Object.keys(old)) old[k] === undefined ? delete process.env[k] : (process.env[k] = old[k]); }
}

test("handler /api/lastfm: 503 sin configurar, 502 si Last.fm falla, tracks si responde, 405 en POST", async () => {
  await withEnv({ LASTFM_API_KEY: undefined, LASTFM_USER: undefined }, async () => {
    const out = await call(require("../api/lastfm/index"));
    assert.equal(out.status, 503);
    assert.equal(out.headers["cache-control"], "no-store");
  });
  const bad = await fake((req, res) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: 10, message: "Invalid API key" })); });
  await withEnv({ LASTFM_API_KEY: "k", LASTFM_USER: "u", LASTFM_API_URL: `http://127.0.0.1:${bad.address().port}/2.0/` }, async () => {
    const out = await call(require("../api/lastfm/index"));
    assert.equal(out.status, 502);
    assert.equal(JSON.stringify(out.body).includes("Invalid"), false);
  });
  bad.close();
  const seen = [];
  const ok = await fake((req, res) => {
    const q = new URL(req.url, "http://x").searchParams; seen.push(Object.fromEntries(q));
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(q.get("method") === "user.gettopartists" ? { topartists: { artist: [{ name: "Uno" }] } } : recent));
  });
  await withEnv({ LASTFM_API_KEY: "secreto", LASTFM_USER: "kaka", LASTFM_API_URL: `http://127.0.0.1:${ok.address().port}/2.0/` }, async () => {
    const out = await call(require("../api/lastfm/index"), { limit: "3" });
    assert.equal(out.status, 200);
    assert.equal(out.body.tracks.length, 3);
    assert.equal(seen[0].method, "user.getrecenttracks");
    assert.equal(seen[0].user, "kaka");
    assert.equal(seen[0].limit, "3");
    assert.match(out.headers["cache-control"], /s-maxage=15/);
    assert.equal(JSON.stringify(out.body).includes("secreto"), false);
    const top = await call(require("../api/lastfm/top-artist"));
    assert.deepEqual(top.body, { artist: "Uno", image: "https://img/now.jpg" });
    assert.equal((await call(require("../api/lastfm/index"), {}, "POST")).status, 405);
  });
  ok.close();
});
