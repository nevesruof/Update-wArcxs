"use strict";
// node --test tests/canary.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { isAllowedHost, check, CANON } = require("../js/canary.js");
const { handleCanary, clean, isDiscordWebhook, _reset } = require("../api/_lib/canary");

test("dominios permitidos: propios, localhost, LAN y previews; el resto no", () => {
  for (const h of ["wwarcxs.vercel.app", "localhost", "127.0.0.1", "192.168.1.50", "10.0.0.7", "172.20.3.4", "[::1]", "x.localhost",
                   "wwarcxs-git-main-nevesruofs-projects.vercel.app", "wwarcxs-abc123-nevesruofs-projects.vercel.app"]) {
    assert.equal(isAllowedHost(h), true, h);
  }
  for (const h of ["evil.com", "wwarcxs.vercel.app.evil.com", "wwarcxs-evil.vercel.app", "otro-nevesruofs-projects.vercel.app",
                   "copia.vercel.app", "172.32.0.1", "192.169.1.1", "wwarcxs.vercel.app.", "xwwarcxs.vercel.app"]) {
    assert.equal(isAllowedHost(h), false, h);
  }
  assert.equal(isAllowedHost("midominio.com", ["midominio.com"]), true);
  assert.equal(CANON, "https://wwarcxs.vercel.app");
});

test("check(): senal solo desde un dominio ajeno y una vez por sesion", () => {
  const sent = []; const store = new Map();
  const st = { getItem: (k) => store.get(k), setItem: (k, v) => store.set(k, v) };
  const nav = { sendBeacon: (u) => { sent.push(u); return true; } };
  const doc = { referrer: "https://google.com/" };
  assert.equal(check({ hostname: "wwarcxs.vercel.app", pathname: "/" }, doc, nav, st), false);
  assert.equal(sent.length, 0);
  assert.equal(check({ hostname: "evil.com", pathname: "/x" }, doc, nav, st), true);
  assert.equal(check({ hostname: "evil.com", pathname: "/x" }, doc, nav, st), false);   // ya avisado en esta sesion
  assert.equal(sent.length, 1);
  assert.match(sent[0], /^https:\/\/wwarcxs\.vercel\.app\/api\/canary\?trap=clone&host=evil\.com&path=%2Fx&ref=/);
});

// --- handler ------------------------------------------------------------------------------------------
function call(query, headers = {}, env = {}, now = Date.now()) {
  return new Promise((resolve) => {
    const out = { headers: {}, status: 0, body: null };
    const res = {
      setHeader: (k, v) => { out.headers[k.toLowerCase()] = v; },
      status(c) { out.status = c; return res; },
      end() { resolve(out); return res; },
      send(b) { out.body = b; resolve(out); return res; },
    };
    handleCanary({ query, headers }, res, env, now);
  });
}
function fakeFetch() {
  const calls = []; const orig = global.fetch;
  global.fetch = async (url, opts) => { calls.push({ url, body: JSON.parse(opts.body) }); return { ok: true }; };
  return { calls, restore: () => { global.fetch = orig; } };
}
const HOOK = "https://discord.com/api/webhooks/123/abc";
const quiet = () => { const w = console.warn; const lines = []; console.warn = (...a) => lines.push(a.join(" ")); return { lines, restore: () => { console.warn = w; } }; };

test("clone: 204, log CANARY y aviso a Discord sin pings ni markdown del atacante", async () => {
  _reset(); const f = fakeFetch(), l = quiet();
  try {
    const out = await call({ trap: "clone", host: "evil.com`@everyone\n**x**", path: "/", ref: "<@&123>" },
      { "x-forwarded-for": "9.9.9.9, 1.1.1.1", "user-agent": "Mozilla/5.0 `bad`" }, { CANARY_WEBHOOK_URL: HOOK });
    assert.equal(out.status, 204);
    assert.equal(out.headers["cache-control"], "no-store");
    assert.equal(l.lines.length, 1);
    assert.match(l.lines[0], /^CANARY \{.*"trap":"clone".*"ip":"9\.9\.9\.9"/);
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].url, HOOK);
    assert.deepEqual(f.calls[0].body.allowed_mentions, { parse: [] });
    const text = f.calls[0].body.content;
    assert.ok(!text.includes("`") && !text.includes("<@") && !text.includes("@everyone") && !/\*\*x/.test(text.split("\n").slice(1).join("\n")), text);
    assert.match(text, /^\*\*CANARY - Copia del sitio detectada\*\*/);
  } finally { f.restore(); l.restore(); }
});

test("bait: responde 404 normal y avisa; scan: 404 y solo log (sin Discord salvo CANARY_ALERT_ALL=1)", async () => {
  _reset(); const f = fakeFetch(), l = quiet();
  try {
    const bait = await call({ trap: "bait", p: "/private/take-backup-2026.zip" }, { "x-forwarded-for": "2.2.2.2" }, { CANARY_WEBHOOK_URL: HOOK });
    assert.equal(bait.status, 404); assert.equal(bait.body, "Not Found"); assert.equal(f.calls.length, 1);
    const scan = await call({ trap: "scan", p: "/wp-login.php" }, { "x-forwarded-for": "3.3.3.3" }, { CANARY_WEBHOOK_URL: HOOK });
    assert.equal(scan.status, 404); assert.equal(f.calls.length, 1);          // no se envio otro aviso
    assert.equal(l.lines.length, 2);                                          // pero si quedo en los logs
    await call({ trap: "scan", p: "/.env" }, { "x-forwarded-for": "4.4.4.4" }, { CANARY_WEBHOOK_URL: HOOK, CANARY_ALERT_ALL: "1" });
    assert.equal(f.calls.length, 2);
    assert.equal((await call({ trap: "loquesea" }, {}, {})).status, 404);     // trap desconocido = scan
  } finally { f.restore(); l.restore(); }
});

test("anti-spam: mismo origen no repite aviso en 10 min; tope de avisos por hora", async () => {
  _reset(); const f = fakeFetch(), l = quiet(); const env = { CANARY_WEBHOOK_URL: HOOK }; const t0 = 1_000_000_000_000;
  try {
    for (let i = 0; i < 5; i++) await call({ trap: "bait" }, { "x-forwarded-for": "5.5.5.5" }, env, t0 + i * 1000);
    assert.equal(f.calls.length, 1);
    await call({ trap: "bait" }, { "x-forwarded-for": "5.5.5.5" }, env, t0 + 11 * 60e3);       // pasados 10 min vuelve a avisar
    assert.equal(f.calls.length, 2);
    for (let i = 0; i < 60; i++) await call({ trap: "bait" }, { "x-forwarded-for": "6.6.6." + i }, env, t0 + 20 * 60e3 + i);
    assert.equal(f.calls.length, 20);                                                           // tope: 20 por hora
  } finally { f.restore(); l.restore(); }
});

test("webhook invalido (no es de Discord / http) se ignora; sin webhook no falla; si Discord cae, responde igual", async () => {
  _reset(); const f = fakeFetch(), l = quiet();
  try {
    assert.equal(isDiscordWebhook("https://evil.com/api/webhooks/1/a"), false);
    assert.equal(isDiscordWebhook("http://discord.com/api/webhooks/1/a"), false);
    assert.equal(isDiscordWebhook("https://canary.discord.com/api/webhooks/1/a"), true);
    await call({ trap: "bait" }, { "x-forwarded-for": "7.7.7.7" }, { CANARY_WEBHOOK_URL: "https://evil.com/api/webhooks/1/a" });
    await call({ trap: "bait" }, { "x-forwarded-for": "7.7.7.8" }, {});
    assert.equal(f.calls.length, 0);
    global.fetch = async () => { throw new Error("discord caido"); };
    const out = await call({ trap: "bait" }, { "x-forwarded-for": "7.7.7.9" }, { CANARY_WEBHOOK_URL: HOOK });
    assert.equal(out.status, 404);
  } finally { f.restore(); l.restore(); }
});

test("clean(): quita pings, markdown, saltos de linea y limita el largo", () => {
  assert.equal(clean("a`b*c_d~e|f>g@h<i\nj[k](l)"), "abcdefghijkl");
  assert.equal(clean("x".repeat(500)).length, 120);
  assert.equal(clean(null), "");
});
