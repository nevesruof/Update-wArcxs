"use strict";
// node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { toPresence, toTracks, toTopArtist } = require("../api/_lib/bot");

const profile = { id: "893966003690668102", username: "zahid", global_name: "Zahid", avatar: "abc123", banner: null };
const song = (name, artist, extra = {}) => ({
  kind: "spotify", type: 2, name, artist, album: "Album", image: "https://i.scdn.co/image/" + name,
  trackId: name, startMs: 1000, endMs: 2000, firstSeen: 1700000000, lastSeen: 1700000100, active: false, ...extra,
});
const snapshot = (over = {}) => ({
  discordUserId: profile.id,
  discord: {
    status: "dnd", connected: true,
    activities: [
      { kind: "custom", type: 4, name: "Custom Status", state: "ocupado" },
      { kind: "playing", type: 0, name: "Minecraft", details: "Survival", state: null, image: "https://cdn/x.png", largeText: "mc", applicationId: "123", startMs: 5000 },
      song("Moneda", "Artista Uno; Artista Dos", { active: true }),
    ],
  },
  profile,
  recentSongs: [song("A", "Uno", { active: true }), song("B", "Dos"), song("C", "Uno"), song("D", "")],
  ...over,
});

test("presencia: estado, avatar, juego, custom status y Spotify", () => {
  const p = toPresence(snapshot());
  assert.equal(p.discord_status, "dnd");
  assert.equal(p.discord_user.avatar, "https://cdn.discordapp.com/avatars/893966003690668102/abc123.png?size=128");
  assert.equal(p.discord_user.display_name, "Zahid");
  assert.deepEqual(p.custom_status, { text: "ocupado", emoji: null });
  assert.equal(p.activities.length, 1);
  assert.equal(p.activities[0].name, "Minecraft");
  assert.equal(p.activities[0].largeImage, "https://cdn/x.png");
  assert.equal(p.activities[0].startTimestamp, 5000);
  assert.equal(p.listening_to_spotify, true);
  assert.equal(p.spotify.song, "Moneda");
  assert.equal(p.spotify.albumArt, "https://i.scdn.co/image/Moneda");
  assert.equal(p.spotify.endTimestamp, 2000);
});

test("presencia: avatar animado usa .gif", () => {
  const p = toPresence(snapshot({ profile: { ...profile, avatar: "a_xyz" } }));
  assert.match(p.discord_user.avatar, /a_xyz\.gif\?size=128$/);
});

test("presencia: unknown / offline / bot sin datos => offline sin actividades", () => {
  for (const status of ["unknown", "offline", undefined, "raro"]) {
    const p = toPresence(snapshot({ discord: { status, activities: [song("X", "Y")] } }));
    assert.equal(p.discord_status, "offline");
    assert.deepEqual(p.activities, []);
    assert.equal(p.spotify, null);
    assert.equal(p.listening_to_spotify, false);
    assert.ok(p.discord_user.avatar); // el avatar se conserva aunque este offline
  }
  assert.equal(toPresence(null).discord_status, "offline");
  assert.equal(toPresence({}).discord_user.avatar, null);
});

test("tracks: respeta limit (1..50), marca nowPlaying y fecha en ms", () => {
  const t = toTracks(snapshot(), "2");
  assert.equal(t.tracks.length, 2);
  assert.equal(t.tracks[0].nowPlaying, true);
  assert.equal(t.tracks[1].nowPlaying, false);
  assert.equal(t.tracks[0].date, 1700000100000);
  assert.equal(toTracks(snapshot(), "999").tracks.length, 4);
  assert.equal(toTracks(snapshot(), "abc").tracks.length, 4);
  assert.deepEqual(toTracks({}, 20), { tracks: [] });
});

test("top artist: el mas repetido, usa el primer artista y su portada mas reciente", () => {
  assert.deepEqual(toTopArtist(snapshot()), { artist: "Uno", image: "https://i.scdn.co/image/A" });
  assert.deepEqual(toTopArtist({ recentSongs: [] }), {});
  assert.deepEqual(toTopArtist(null), {});
});

// --- handlers contra un "bot" falso ---------------------------------------------------------
function fakeBot(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler).listen(0, "127.0.0.1", () => resolve(server));
  });
}
function call(mod, query = {}, method = "GET") {
  return new Promise((resolve) => {
    const out = { headers: {}, status: 200, body: null };
    const res = {
      setHeader: (k, v) => { out.headers[k.toLowerCase()] = v; },
      status(c) { out.status = c; return res; },
      json(b) { out.body = b; resolve(out); return res; },
    };
    mod({ method, query }, res);
  });
}
function withEnv(env, fn) {
  const old = {};
  for (const k of Object.keys(env)) { old[k] = process.env[k]; process.env[k] = env[k]; }
  return fn().finally(() => { for (const k of Object.keys(old)) old[k] === undefined ? delete process.env[k] : (process.env[k] = old[k]); });
}

test("handler /api/activity: envia el token Bearer y devuelve la presencia", async () => {
  let seen = null;
  const bot = await fakeBot((req, res) => { seen = req.headers.authorization; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(snapshot())); });
  await withEnv({ ACTIVITY_BOT_URL: `http://127.0.0.1:${bot.address().port}/api/activity`, ACTIVITY_BOT_TOKEN: "secreto" }, async () => {
    const out = await call(require("../api/activity"));
    assert.equal(seen, "Bearer secreto");
    assert.equal(out.status, 200);
    assert.equal(out.body.discord_status, "dnd");
    assert.match(out.headers["cache-control"], /s-maxage=2/);
    assert.equal(typeof out.body.now, "number"); // hora del servidor para sincronizar el segundo de la cancion
    assert.equal(out.body.last_active, null); // online: no hay "last active"
    assert.equal(JSON.stringify(out.body).includes("secreto"), false);
  });
  bot.close();
});

test("handler /api/activity: bot caido o 401 => 200 offline sin cachear", async () => {
  const bot = await fakeBot((req, res) => { res.statusCode = 401; res.end("{}"); });
  await withEnv({ ACTIVITY_BOT_URL: `http://127.0.0.1:${bot.address().port}/api/activity` }, async () => {
    const out = await call(require("../api/activity"));
    assert.equal(out.status, 200);
    assert.equal(out.body.discord_status, "offline");
    assert.equal(typeof out.body.now, "number");
    assert.equal(out.headers["cache-control"], "no-store");
  });
  bot.close();
  await withEnv({ ACTIVITY_BOT_URL: "http://127.0.0.1:9/api/activity" }, async () => {
    const out = await call(require("../api/activity"));
    assert.equal(out.body.discord_status, "offline");
  });
});
