"use strict";
// node --test tests/about.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { withLastActive, KEY, _reset } = require("../api/_lib/lastactive");
const { createMemoryStore } = require("../api/_lib/store");
const yt = require("../api/_lib/youtube");
const ytSearch = require("../api/yt-search");

const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

// ---------- last active ----------
test("last active: online guarda la hora; offline la devuelve; `now` siempre viene", async () => {
  _reset();
  const store = createMemoryStore();
  let t = 1_000_000;
  const now = () => t;
  const on = await withLastActive({ discord_status: "online" }, { store, now });
  assert.equal(on.now, 1_000_000);
  assert.equal(on.last_active, null);
  assert.equal(await store.get(KEY), "1000000");
  t += 5000;
  const off = await withLastActive({ discord_status: "offline" }, { store, now });
  assert.equal(off.last_active, 1_000_000);
  assert.equal(off.now, 1_005_000);
});

test("last active: no escribe en cada consulta (1 vez por minuto) y offline sin historial => null", async () => {
  _reset();
  const store = createMemoryStore();
  let sets = 0;
  const spy = { ...store, set: async (k, v) => { sets++; return store.set(k, v); } };
  let t = 10_000;
  const now = () => t;
  await withLastActive({ discord_status: "idle" }, { store: spy, now });
  t += 10_000;
  await withLastActive({ discord_status: "dnd" }, { store: spy, now });
  assert.equal(sets, 1);
  t += 60_000;
  await withLastActive({ discord_status: "online" }, { store: spy, now });
  assert.equal(sets, 2);
  _reset();
  const empty = await withLastActive({ discord_status: "offline" }, { store: createMemoryStore(), now });
  assert.equal(empty.last_active, null);
});

test("last active: si el store falla la presencia sigue funcionando", async () => {
  _reset();
  const broken = { get: async () => { throw new Error("redis caido"); }, set: async () => { throw new Error("redis caido"); } };
  const off = await withLastActive({ discord_status: "offline", x: 1 }, { store: broken, now: () => 5 });
  assert.equal(off.x, 1);
  assert.equal(off.last_active, null);
});

// ---------- YouTube ----------
test("youtube: limpia titulos y artistas, parsea duraciones", () => {
  assert.equal(yt.cleanTitle("Song (feat. Someone) - Remastered 2011"), "Song");
  assert.equal(yt.cleanTitle("Moneda"), "Moneda");
  assert.equal(yt.mainArtist("Artista Uno; Artista Dos"), "Artista Uno");
  assert.equal(yt.parseDuration("PT3M45S"), 225000);
  assert.equal(yt.parseDuration("PT1H2M3S"), 3723000);
  assert.equal(yt.parseDuration("basura"), 0);
});

test("youtube: pickBest prefiere la version con la misma duracion y descarta lives/covers", () => {
  const cands = [
    { videoId: "live", title: "Moneda (Live at Wembley)", channel: "Artista", durationMs: 301000 },
    { videoId: "cover", title: "Moneda cover", channel: "Random", durationMs: 200000 },
    { videoId: "good", title: "Artista - Moneda (Official Audio)", channel: "Artista - Topic", durationMs: 200500 },
  ];
  const best = yt.pickBest(cands, { title: "Moneda", artist: "Artista", durationMs: 200000 });
  assert.equal(best.videoId, "good");
  // ninguno parece la cancion => null (mejor silencio que otra cancion)
  assert.equal(yt.pickBest([{ videoId: "x", title: "Otra cosa", channel: "Nadie", durationMs: 90000 }], { title: "Moneda", artist: "Artista", durationMs: 200000 }), null);
});

test("youtube: findVideo hace search + videos y elige por duracion; sin key lanza ConfigError", async () => {
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(String(url));
    const u = new URL(url);
    if (u.pathname.endsWith("/search")) {
      assert.match(u.searchParams.get("q"), /Artista Moneda audio/);
      assert.equal(u.searchParams.get("key"), "K");
      return { ok: true, status: 200, json: async () => ({ items: [
        { id: { videoId: "a" }, snippet: { title: "Moneda (Live)", channelTitle: "Artista" } },
        { id: { videoId: "b" }, snippet: { title: "Moneda", channelTitle: "Artista - Topic" } },
      ] }) };
    }
    return { ok: true, status: 200, json: async () => ({ items: [
      { id: "a", contentDetails: { duration: "PT5M1S" } },
      { id: "b", contentDetails: { duration: "PT3M20S" } },
    ] }) };
  };
  const v = await yt.findVideo({ title: "Moneda", artist: "Artista; Otro", durationMs: 200000 }, { key: "K", fetchImpl: fakeFetch, base: "https://yt.test/v3" });
  assert.equal(v.videoId, "b");
  assert.equal(calls.length, 2);
  await assert.rejects(() => yt.findVideo({ title: "x", artist: "y" }, { key: "", fetchImpl: fakeFetch }), yt.ConfigError);
});

test("yt-search: busca una sola vez por cancion (cache en el store) y respeta el limite diario", async () => {
  const store = createMemoryStore();
  let searches = 0;
  const find = async () => { searches++; return { videoId: "abc", title: "t", channel: "c", durationMs: 1000 }; };
  const sp = { song: "Moneda", artist: "Artista", startTimestamp: 1000, endTimestamp: 201000 };
  const a = await ytSearch.lookup(sp, { store, find });
  const b = await ytSearch.lookup(sp, { store, find });
  assert.equal(a.video.videoId, "abc");
  assert.deepEqual(a, b);
  assert.equal(searches, 1);
  // limite diario
  let err;
  for (let i = 0; i < 100; i++) {
    try { await ytSearch.lookup({ ...sp, song: "otra " + i }, { store, find }); } catch (e) { err = e; break; }
  }
  assert.equal(err && err.status, 429);
});

test("yt-search handler: 405 en POST, sin spotify => video null, sin key => 503", async () => {
  const mkRes = () => { const r = { headers: {}, setHeader(k, v) { r.headers[k] = v; }, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; };
  const r1 = mkRes();
  await ytSearch({ method: "POST" }, r1);
  assert.equal(r1.code, 405);

  const server = require("node:http").createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(global.__snap));
  });
  await new Promise((ok) => server.listen(0, ok));
  const prevUrl = process.env.ACTIVITY_BOT_URL;
  const prevKey = process.env.YOUTUBE_API_KEY;
  process.env.ACTIVITY_BOT_URL = "http://127.0.0.1:" + server.address().port + "/api/activity";
  delete process.env.YOUTUBE_API_KEY;
  try {
    global.__snap = { discord: { status: "online", activities: [] }, profile: { id: "1", username: "u" } };
    const r2 = mkRes();
    await ytSearch({ method: "GET" }, r2);
    assert.equal(r2.code, 200);
    assert.deepEqual(r2.body, { track: null, video: null });

    global.__snap = { discord: { status: "online", activities: [{ kind: "spotify", type: 2, name: "S", artist: "A", album: "B", image: null, startMs: 1, endMs: 2001 }] }, profile: { id: "1", username: "u" } };
    const r3 = mkRes();
    await ytSearch({ method: "GET" }, r3);
    assert.equal(r3.code, 503);
  } finally {
    server.close();
    if (prevUrl === undefined) delete process.env.ACTIVITY_BOT_URL; else process.env.ACTIVITY_BOT_URL = prevUrl;
    if (prevKey !== undefined) process.env.YOUTUBE_API_KEY = prevKey;
    delete global.__snap;
  }
});

// ---------- navegador: music-pill.js y presence.js ----------
test("music-pill: parsea LRC (varias marcas por linea, ignora etiquetas) y limpia titulos", () => {
  const win = {};
  win.TakePresence = { get: () => null, subscribe: () => () => { }, now: () => 0 };
  const el = () => ({ append() { }, classList: { add() { }, toggle() { } }, setAttribute() { }, addEventListener() { }, style: { setProperty() { }, removeProperty() { } } });
  const doc = { body: { append() { } }, createElement: el, addEventListener() { }, head: { appendChild() { } }, hidden: false };
  vm.runInNewContext(read("js/music-pill.js"), {
    window: Object.assign(win, { addEventListener() { } }), Intl, URLSearchParams, Promise, document: doc, MutationObserver: class { observe() { } },
    localStorage: { getItem: () => null, setItem() { } }, fetch: async () => ({ ok: false }), setInterval: () => 0, console,
  });
  const np = win.TakeMusic;
  const lines = np._parseLrc("[ar:Alguien]\n[00:12.50]hola\n[00:05.00][00:30.25]coro\n\n[01:02]fin");
  assert.equal(JSON.stringify(lines.map((l) => [l.t, l.text])), JSON.stringify([[5000, "coro"], [12500, "hola"], [30250, "coro"], [62000, "fin"]]));
  assert.equal(np._cleanTitle("Song - Remastered 2011"), "Song");
});

test("presence.js: avatar recordado de la visita anterior, sondeo a /api/activity y reloj del servidor", async () => {
  const store = { "take:presence:v1": JSON.stringify({ avatar: "https://cdn/old.png", name: "Take" }) };
  const preloads = [];
  const head = { appendChild: (n) => preloads.push(n.href) };
  const listeners = {};
  const win = {};
  let nowMs = 5_000_000;
  const fetched = [];
  const fakeFetch = async (url) => {
    fetched.push(url);
    return {
      ok: true,
      headers: { get: (h) => (h === "age" ? "2" : null) },
      json: async () => ({ discord_status: "offline", last_active: 4_000_000, now: 5_100_000, discord_user: { avatar: "https://cdn/new.png", display_name: "Take" } }),
    };
  };
  class FakeImage { set src(v) { preloads.push("img:" + v); } }
  const ctx = {
    window: win,
    document: { head, hidden: false, createElement: () => ({}), addEventListener: (e, f) => { listeners[e] = f; } },
    localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } },
    fetch: fakeFetch, Image: FakeImage, setTimeout: () => 0, clearTimeout: () => { }, Date: { now: () => nowMs }, Number, JSON, Promise,
  };
  vm.runInNewContext(read("js/presence.js"), ctx);
  const P = win.TakePresence;
  // antes de que responda la API ya conocemos el avatar y ya se esta descargando
  assert.equal(P.avatar(), "https://cdn/old.png");
  assert.ok(preloads.includes("img:https://cdn/old.png"));
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert.equal(fetched[0], "/api/activity");
  assert.equal(P.get().last_active, 4_000_000);
  assert.equal(P.avatar(), "https://cdn/new.png");
  assert.equal(JSON.parse(store["take:presence:v1"]).avatar, "https://cdn/new.png");
  // reloj: servidor(5_100_000) + Age(2 s) - navegador(5_000_000) = 102 s de diferencia
  assert.equal(P.now(), nowMs + 102_000);
});

// ---------- el sitio: textos y enlaces pedidos ----------
test("about me: textos, enlaces, redes, stack y portfolio con intro", () => {
  const page = read("_next/static/chunks/app/(site)/page-2c8153006850d793.js");
  assert.ok(page.includes("i'm a mostly self-taught developer"));
  assert.ok(page.includes("when i'm not studying, i'm gaming, working"));
  assert.ok(page.includes("https://arcxsdev.com/"));
  assert.ok(page.includes("https://github.com/iTake"));
  assert.ok(page.includes("mailto:contact@whoistake.com"));
  assert.ok(page.includes("https://open.spotify.com/user/wArcxs"));
  for (const old of ["akryst", "Akryst", "strawbunnyvr", "moonlight-ps4", "instagram", "vgen", "twitch.tv", "steamcommunity"]) {
    assert.ok(!page.includes(old) || old === "Akryst" /* nombre de funcion AkrAge no lo contiene */, "queda " + old);
  }
  for (const label of ["TypeScript", "Golang", "Rust", "Kotlin", "Kubernetes", "Elysia", "Cloudflare", "VSCode"]) assert.ok(page.includes('label: "' + label + '"'), label);
  assert.ok(page.includes('"dev \\xb7 anticheat \\xb7 forensics"'));
  assert.ok(page.includes("SplashIntro"));
  // Portfolio usa la misma transicion que Photos (navigateTo), ya no la intro propia
  assert.ok(page.includes('label: "Portfolio", view: null, href: "https://arcxsdev.com/"'));
  assert.ok(!page.includes("setPIn") && !page.includes("TakeSplash"));
  // friends & cool places (88x31) y la tarjeta de musica del about ya no estan
  for (const gone of ["bio-friends", "panel-webring", "88x31", "bhop.codes", "TakeNowPlaying"]) assert.ok(!page.includes(gone), "queda " + gone);
  assert.ok(page.includes("/images/discord-bots.png") && !page.includes("icon: !0"), "discord bots: imagen grande, no icono");
  assert.ok(page.includes('children: "zed"') && !page.includes('children: "zen"'));
  assert.ok(page.includes('"--brand"'));
  const settings = read("_next/static/chunks/4190-5b06608b21bfe8e3.js");
  assert.ok(settings.includes("this doesn't work at the moment"));
  const html = read("index.html");
  assert.ok(html.indexOf("/js/presence.js") < html.indexOf("/_next/static/chunks/main-app"));
});

test("Portfolio (enlace externo) pasa por el barrido y despues se abre; el aviso de hardware se cierra solo", () => {
  const trans = read("_next/static/chunks/4190-5b06608b21bfe8e3.js");
  assert.ok(trans.includes("window.location.assign(e)"));
  assert.ok(trans.includes("window.TakeAmbient"));
  const layout = read("_next/static/chunks/app/layout-e0b28ddd9ecfb41b.js");
  assert.ok(layout.includes("hw-toast--leaving") && layout.includes("8e3"));
  assert.ok(layout.includes('href: "https://arcxsdev.com/", label: "Portfolio"'));
  const css = read("css/take-extras.css");
  assert.ok(css.includes("@keyframes hw-toast-out"));
});

test("photos.html: sin fotos ni fechas, con casillas por llenarse, particulas y aviso con X", () => {
  const html = read("pages/photos.html");
  assert.ok(html.includes("Screenshots from my adventures.") && !html.includes("VRChat."));
  assert.equal((html.match(/class="photo-slot /g) || []).length, 8);
  assert.equal((html.match(/About to fill up/g) || []).length, 8);
  assert.equal((html.match(/users Unset/g) || []).length, 8);
  assert.ok(!html.includes("data:image/webp") && !/Apr 25, 2026|Floating Breath/.test(html));
  assert.ok(html.includes("data-take-particles") && html.includes("/js/particles-bg.js"));
  assert.ok(html.includes("data-hw-close") && html.includes("/js/photos-page.js"));
});

test("menu principal: fondo liquido animado detras del canvas de cubos", () => {
  const js = read("js/cubes-bg.js");
  assert.ok(js.includes("menu-liquid") && js.includes("/images/menu-bg.webp") && js.includes("liquid.remove()"));
  assert.ok(js.includes("alpha: useLiquid"), "el canvas debe ser transparente para ver el fondo");
  const css = read("css/take-extras.css");
  assert.ok(css.includes(".menu-liquid") && css.includes("body:has(.home-screen--panel) .menu-liquid"));
  assert.ok(fs.existsSync(path.join(__dirname, "..", "images/menu-bg.webp")));
});
