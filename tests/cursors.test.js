"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
let WebSocket = null;
for (const p of ["ws", "../cursors-server/node_modules/ws"]) { try { WebSocket = require(p); break; } catch (_) {} }
let createCursorServer = null;
if (WebSocket) ({ createCursorServer } = require("../cursors-server/server"));
const { signOwnerToken } = require("../api/_lib/backend");
const SECRET = "secreto-de-prueba-largo";
const skip = WebSocket ? false : "falta el paquete ws (npm install en cursors-server/)";

async function start(opts = {}) {
  const app = createCursorServer({ secret: SECRET, allowedOrigins: "", ...opts });
  const port = await app.listen(0, "127.0.0.1");
  const url = "ws://127.0.0.1:" + port + "/api/cursors";
  const connect = (headers) => new Promise((ok, fail) => {
    const ws = new WebSocket(url, { headers }); ws.inbox = [];
    ws.on("message", (d) => { const m = JSON.parse(d); ws.inbox.push(m); (ws.waiters || []).forEach((w) => w()); });
    ws.once("open", () => ok(ws)); ws.once("error", fail); ws.once("unexpected-response", (_, res) => fail(new Error("HTTP " + res.statusCode)));
  });
  return { app, connect, url };
}
const next = (ws, pred, ms = 1500) => new Promise((ok, fail) => {
  const find = () => { const i = ws.inbox.findIndex(pred); return i < 0 ? null : ws.inbox.splice(i, 1)[0]; };
  const hit = find(); if (hit) return ok(hit);
  const t = setTimeout(() => { ws.waiters = ws.waiters.filter((w) => w !== check); fail(new Error("timeout esperando mensaje")); }, ms);
  const check = () => { const m = find(); if (m) { clearTimeout(t); ws.waiters = ws.waiters.filter((w) => w !== check); ok(m); } };
  (ws.waiters = ws.waiters || []).push(check);
});
const quiet = async (ws, pred, ms = 250) => { try { await next(ws, pred, ms); return false; } catch (_) { return true; } };
const send = (ws, m) => ws.send(JSON.stringify(m));
const type = (t) => (m) => m.type === t;

test("cursores: identidad, movimiento y salida", { skip }, async () => {
  const { app, connect } = await start();
  const a = await connect(), b = await connect();
  const ida = await next(a, type("identity")); await next(b, type("identity"));
  assert.match(ida.label, /^guest-[0-9a-f]{4}$/); assert.equal(ida.owner, false); assert.match(ida.color, /^#[0-9a-f]{6}$/);
  send(b, { type: "move", x: 0.3, y: 0.4, width: 1920, height: 945 });
  const cur = await next(a, type("cursor"));
  assert.equal(cur.x, 0.3); assert.equal(cur.y, 0.4); assert.equal(cur.owner, false); assert.equal(cur.scene, "underwater");
  send(b, { type: "move", x: 9, y: -3 }); await new Promise((r) => setTimeout(r, 40)); send(b, { type: "move", x: 2, y: -3 });
  assert.equal(await quiet(a, (m) => m.type === "cursor" && (m.x > 1 || m.y < 0)), true);
  send(b, { type: "idle" }); assert.equal((await next(a, type("leave"))).id, cur.id);
  b.close(); await next(a, type("leave"));
  a.close(); await app.close();
});

test("cursores: perfil, dueno e impersonacion", { skip }, async () => {
  const { app, connect } = await start();
  const a = await connect(), b = await connect(); await next(a, type("identity")); await next(b, type("identity"));
  send(a, { type: "profile", nickname: "Ana <b>", visitorToken: "11111111-1111-4111-8111-111111111111" });
  assert.equal((await next(a, type("identity"))).label, "Ana b");
  send(a, { type: "profile", nickname: "TAKE" });
  assert.match((await next(a, type("identity"))).label, /^guest-/);
  send(a, { type: "profile", nickname: "x", ownerToken: "v1.99999999999999." + "0".repeat(64) });
  assert.equal((await next(a, type("identity"))).owner, false);
  send(b, { type: "profile", nickname: "x", ownerToken: signOwnerToken(SECRET) });
  const idb = await next(b, type("identity")); assert.equal(idb.owner, true); assert.equal(idb.label, "take");
  send(b, { type: "move", x: 0.5, y: 0.5 }); assert.equal((await next(a, type("cursor"))).owner, true);
  a.close(); b.close(); await app.close();
});

test("cursores: rutas separadas, clicks, escena y chat con limite", { skip }, async () => {
  const { app, connect } = await start();
  const a = await connect(), b = await connect(), c = await connect();
  for (const w of [a, b, c]) await next(w, type("identity"));
  send(c, { type: "route", path: "/photos" });
  send(b, { type: "move", x: 0.1, y: 0.2 });
  await next(a, type("cursor"));
  assert.equal(await quiet(c, type("cursor")), true);
  send(b, { type: "click", x: 0.6, y: 0.7 });
  const click = await next(a, type("click")); assert.equal(click.x, 0.6); assert.equal(click.owner, false);
  send(b, { type: "scene", scene: "neutral" });
  assert.equal((await next(a, type("scene"))).scene, "neutral");
  send(b, { type: "scene", scene: "<script>" });
  assert.equal(await quiet(a, type("scene")), true);
  send(b, { type: "chat", text: "  hola   a todos  " });
  const sp = await next(a, type("speech")); assert.equal(sp.text, "hola a todos"); await next(b, type("speech"));
  send(b, { type: "chat", text: "otra vez" });
  assert.match((await next(b, type("error"))).message, /wait/i);
  await new Promise((r) => setTimeout(r, 700));
  send(b, { type: "reaction", text: "\u2764\uFE0F" });
  assert.equal((await next(a, type("speech"))).reaction, "\u2764\uFE0F");
  send(b, { type: "reaction", text: "💩" }); await new Promise((r) => setTimeout(r, 700));
  assert.equal(await quiet(a, type("speech")), true);
  for (const w of [a, b, c]) w.close(); await app.close();
});

test("cursores: origen no permitido y limite por IP", { skip }, async () => {
  const s1 = await start({ allowedOrigins: "wwarcxs.vercel.app, https://midominio.com/" });
  await assert.rejects(s1.connect({ Origin: "https://evil.example" }), /403/);
  await assert.rejects(s1.connect({}), /403/);
  const ok = await s1.connect({ Origin: "https://midominio.com" }); ok.close(); await s1.app.close();
  const s2 = await start({ maxPerIp: 2 });
  const x = await s2.connect(), y = await s2.connect();
  await assert.rejects(s2.connect(), /429/);
  x.close(); y.close(); await s2.app.close();
});
