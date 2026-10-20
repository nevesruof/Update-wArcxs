"use strict";
// node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const B = require("../api/_lib/backend");
const { createMemoryStore, createRedisStore } = require("../api/_lib/store");

const ADMIN = "correct-horse-battery";
const mkRes = () => {
  const h = {};
  return { statusCode: 200, body: undefined, headers: h, setHeader(k, v) { h[k.toLowerCase()] = v; }, getHeader(k) { return h[k.toLowerCase()]; },
    status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
};
const mkReq = (method, body, headers = {}) => ({ method, body, headers: { "x-forwarded-for": "1.2.3.4", ...headers } });
const setup = (env = {}) => {
  const e = { ADMIN_KEY: ADMIN, ...env }, store = createMemoryStore();
  const call = async (fn, req) => { const res = mkRes(); await fn(req, res, e, store); return res; };
  return { env: e, store, call };
};
const vidOf = (res) => /tk-vid=([0-9a-f-]{36})/.exec([].concat(res.headers["set-cookie"] || []).join(";"))[1];
const asVisitor = (vid, extra = {}) => ({ cookie: "tk-vid=" + vid, ...extra });

test("libro de visitas: crear, validar y listar", async () => {
  const { call } = setup();
  const ok = await call(B.guestbook, mkReq("POST", { name: "  Ana  ", message: "hola\u200b mundo", website: "https://ana.dev" }));
  assert.equal(ok.statusCode, 201);
  assert.deepEqual(Object.keys(ok.body).sort(), ["id", "liked", "likes", "message", "name", "ownerLiked", "reply", "timestamp", "website"]);
  assert.equal(ok.body.name, "Ana"); assert.equal(ok.body.message, "hola mundo"); assert.equal(ok.body.likes, 0); assert.equal(ok.body.reply, null);
  assert.equal(ok.body.website, "https://ana.dev/");
  const list = await call(B.guestbook, mkReq("GET"));
  assert.equal(list.statusCode, 200); assert.equal(list.body.length, 1); assert.equal(list.body[0].id, ok.body.id);
  assert.equal(list.headers["cache-control"], "no-store");

  const bad = async (body, re) => { const r = await call(B.guestbook, mkReq("POST", body, { "x-forwarded-for": "9.9.9." + Math.floor(Math.random() * 200) })); assert.equal(r.statusCode, 400); assert.match(r.body.error, re); };
  await bad({ message: "   " }, /message/i);
  await bad({ message: "x".repeat(201) }, /too long/i);
  await bad({ message: "hola", website: "javascript:alert(1)" }, /website/i);
  await bad({ message: "hola", website: "https://user:pw@evil.com" }, /website/i);
  await bad({ message: "http://a.com http://b.com http://c.com" }, /links/i);
  const anon = await call(B.guestbook, mkReq("POST", { message: "sin nombre" }, { "x-forwarded-for": "5.5.5.5" }));
  assert.equal(anon.body.name, "Anonymous"); assert.equal("website" in anon.body, false);
});

test("libro de visitas: limite de envio (cooldown y por hora)", async () => {
  const { call } = setup();
  const first = await call(B.guestbook, mkReq("POST", { message: "uno" }));
  const vid = vidOf(first);
  const again = await call(B.guestbook, mkReq("POST", { message: "dos" }, asVisitor(vid)));
  assert.equal(again.statusCode, 429);
  let last;
  for (let i = 0; i < 8; i++) last = await call(B.guestbook, mkReq("POST", { message: "m" + i }));
  assert.equal(last.statusCode, 429); assert.match(last.body.error, /network|many/i);
});

test("likes: uno por visitante y 'liked' en el listado", async () => {
  const { call } = setup();
  const post = await call(B.guestbook, mkReq("POST", { message: "hola" }));
  const id = post.body.id;
  const a = "11111111-1111-4111-8111-111111111111", b = "22222222-2222-4222-8222-222222222222";
  assert.equal((await call(B.guestbook, mkReq("PATCH", { id }, asVisitor(a)))).body.likes, 1);
  assert.equal((await call(B.guestbook, mkReq("PATCH", { id }, asVisitor(a)))).body.likes, 1);
  assert.equal((await call(B.guestbook, mkReq("PATCH", { id }, asVisitor(b)))).body.likes, 2);
  const asA = (await call(B.guestbook, mkReq("GET", undefined, asVisitor(a)))).body[0];
  const asNew = (await call(B.guestbook, mkReq("GET", undefined, asVisitor("33333333-3333-4333-8333-333333333333")))).body[0];
  assert.equal(asA.likes, 2); assert.equal(asA.liked, true); assert.equal(asNew.liked, false);
  assert.equal((await call(B.guestbook, mkReq("PATCH", { id: "noexiste1" }))).statusCode, 404);
  assert.equal((await call(B.guestbook, mkReq("PATCH", { id: "../x" }))).statusCode, 400);
});

test("admin: responder, borrar respuesta y like del dueno", async () => {
  const { call } = setup();
  const id = (await call(B.guestbook, mkReq("POST", { message: "hola" }))).body.id;
  const as = (key) => ({ "x-admin-key": key });
  assert.equal((await call(B.guestbook, mkReq("PATCH", { id, action: "reply", reply: "x" }))).statusCode, 401);
  assert.equal((await call(B.guestbook, mkReq("PATCH", { id, action: "reply", reply: "x" }, as("mala")))).statusCode, 401);
  const r = await call(B.guestbook, mkReq("PATCH", { id, action: "reply", reply: " gracias! " }, as(ADMIN)));
  assert.equal(r.statusCode, 200); assert.equal(r.body.reply, "gracias!");
  assert.equal((await call(B.guestbook, mkReq("GET"))).body[0].reply, "gracias!");
  assert.equal((await call(B.guestbook, mkReq("PATCH", { id, action: "owner-like" }, as(ADMIN)))).body.ownerLiked, true);
  assert.equal((await call(B.guestbook, mkReq("PATCH", { id, action: "owner-like" }, as(ADMIN)))).body.ownerLiked, false);
  assert.equal((await call(B.guestbook, mkReq("PATCH", { id, action: "reply", reply: "" }, as(ADMIN)))).body.reply, null);
  assert.equal((await call(B.guestbook, mkReq("PATCH", { id, action: "borrar-todo" }, as(ADMIN)))).statusCode, 400);
});

test("admin: verify, bloqueo por fuerza bruta y sin clave configurada", async () => {
  const { call } = setup();
  assert.equal((await call(B.adminVerify, mkReq("POST", {}, { "x-admin-key": ADMIN }))).statusCode, 200);
  assert.equal((await call(B.adminVerify, mkReq("GET"))).statusCode, 405);
  for (let i = 0; i < 8; i++) assert.equal((await call(B.adminVerify, mkReq("POST", {}, { "x-admin-key": "mala" + i }))).statusCode, 401);
  const blocked = await call(B.adminVerify, mkReq("POST", {}, { "x-admin-key": ADMIN }));
  assert.equal(blocked.statusCode, 429);
  assert.equal((await call(B.adminVerify, mkReq("POST", {}, { "x-admin-key": ADMIN, "x-forwarded-for": "8.8.8.8" }))).statusCode, 200);
  const off = setup({ ADMIN_KEY: "corta" });
  assert.equal((await off.call(B.adminVerify, mkReq("POST", {}, { "x-admin-key": "corta" }))).statusCode, 503);
  const none = setup({ ADMIN_KEY: undefined });
  assert.equal((await none.call(B.adminVerify, mkReq("POST", {}, { "x-admin-key": "" }))).statusCode, 503);
});

test("contador: suma una vez por visitante cada 12 h y respeta VISITS_BASE", async () => {
  const { call } = setup({ VISITS_BASE: "100" });
  const first = await call(B.counter, mkReq("GET"));
  assert.equal(first.body.count, 101);
  assert.match([].concat(first.headers["set-cookie"]).join(";"), /tk-seen=1.*Max-Age=43200.*HttpOnly/);
  assert.equal((await call(B.counter, mkReq("GET", undefined, { cookie: "tk-seen=1" }))).body.count, 101);
  assert.equal((await call(B.counter, mkReq("GET"))).body.count, 102);
  assert.equal((await call(B.counter, mkReq("POST"))).statusCode, 405);
});

test("settings: mensaje del home (publico para leer, admin para cambiar)", async () => {
  const { call } = setup({ HOME_MESSAGE: "hola desde env" });
  assert.deepEqual((await call(B.settings, mkReq("GET"))).body, { homeMessage: "hola desde env" });
  assert.equal((await call(B.settings, mkReq("PUT", { homeMessage: "x" }))).statusCode, 401);
  assert.equal((await call(B.settings, mkReq("PUT", { homeMessage: "nuevo" }, { "x-admin-key": ADMIN }))).body.homeMessage, "nuevo");
  assert.equal((await call(B.settings, mkReq("GET"))).body.homeMessage, "nuevo");
  assert.equal((await call(B.settings, mkReq("PUT", { homeMessage: "" }, { "x-admin-key": ADMIN }))).body.homeMessage, "");
  assert.equal((await call(B.settings, mkReq("PUT", { homeMessage: "x".repeat(201) }, { "x-admin-key": ADMIN }))).statusCode, 400);
});

test("token de dueno para cursores: firma, caducidad y manipulacion", async () => {
  const { call, env } = setup({ CURSOR_SECRET: "otro-secreto-largo" });
  const res = await call(B.cursorToken, mkReq("POST", {}, { "x-admin-key": ADMIN }));
  assert.equal(res.statusCode, 200);
  assert.equal(B.verifyOwnerToken(res.body.token, env.CURSOR_SECRET), true);
  assert.equal(B.verifyOwnerToken(res.body.token, ADMIN), false);
  assert.equal(B.verifyOwnerToken(res.body.token.replace(/.$/, (c) => (c === "0" ? "1" : "0")), env.CURSOR_SECRET), false);
  const expired = B.signOwnerToken("s", 1000, 10);
  assert.equal(B.verifyOwnerToken(expired, "s", 5000), false);
  assert.equal((await call(B.cursorToken, mkReq("POST", {}))).statusCode, 401);
});

test("almacen Redis: manda los comandos REST correctos", async () => {
  const seen = [];
  const fake = async (url, init) => {
    const body = JSON.parse(init.body); seen.push({ url, body, auth: init.headers.Authorization });
    if (url.endsWith("/pipeline")) return { ok: true, status: 200, json: async () => [{ result: 3 }, { result: 1 }] };
    const r = body[0] === "HGETALL" ? ["a", "1", "b", "2"] : body[0] === "SET" ? "OK" : 7;
    return { ok: true, status: 200, json: async () => ({ result: r }) };
  };
  const s = createRedisStore("https://redis.example/", "tok", fake);
  assert.equal(await s.incr("k"), 7);
  assert.deepEqual(await s.hgetall("h"), { a: "1", b: "2" });
  assert.equal(await s.hit("rl", 60), 3);
  assert.equal(await s.claim("c", 20), true);
  assert.deepEqual(seen.map((x) => x.body[0]), ["INCR", "HGETALL", ["INCR", "rl"], "SET"]);
  assert.equal(seen[0].url, "https://redis.example"); assert.equal(seen[0].auth, "Bearer tok");
  assert.equal(seen[2].url, "https://redis.example/pipeline");
  assert.deepEqual(seen[2].body, [["INCR", "rl"], ["EXPIRE", "rl", "60", "NX"]]);
  assert.deepEqual(seen[3].body, ["SET", "c", "1", "EX", "20", "NX"]);
});
