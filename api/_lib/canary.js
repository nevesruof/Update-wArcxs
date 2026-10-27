"use strict";
/* TKWM-40632a5f-41f0-9fe6-22f804d522ac */
const DEDUPE_MS = 10 * 60 * 1000;
const MAX_WEBHOOKS_PER_HOUR = 20;
const seen = new Map();
let sent = [];

function clean(v, max = 120) {
  return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029`*_~|>@<\[\]()]/g, "").trim().slice(0, max);
}
function clientIp(req) {
  const h = (req.headers && (req.headers["x-forwarded-for"] || req.headers["x-real-ip"])) || "";
  return clean(String(h).split(",")[0], 64) || "?";
}
function one(v) { return Array.isArray(v) ? v[0] : v; }

function isDiscordWebhook(u) {
  try { const x = new URL(u); return x.protocol === "https:" && /^(discord|discordapp)\.com$/.test(x.hostname.replace(/^(canary\.|ptb\.)/, "")) && x.pathname.startsWith("/api/webhooks/"); }
  catch (_) { return false; }
}

async function notify(entry, env, now) {
  const url = env.CANARY_WEBHOOK_URL;
  if (!url || !isDiscordWebhook(url)) return false;
  if (entry.trap === "scan" && env.CANARY_ALERT_ALL !== "1") return false;
  sent = sent.filter((t) => now - t < 3600e3);
  if (sent.length >= MAX_WEBHOOKS_PER_HOUR) return false;
  sent.push(now);
  const title = entry.trap === "clone" ? "Copia del sitio detectada" : entry.trap === "bait" ? "Cebo tocado (bot/scraper)" : "Escaneo detectado";
  const lines = ["**CANARY - " + title + "**"];
  if (entry.host) lines.push("host: " + clean(entry.host) );
  lines.push("ruta: " + (clean(entry.path) || "/") + (entry.ref ? "  |  ref: " + clean(entry.ref) : ""));
  lines.push("ip: " + entry.ip + "  |  ua: " + clean(entry.ua, 90));
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 4000);
  try {
    await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, signal: ctl.signal,
      body: JSON.stringify({ username: "take-canary", content: lines.join("\n").slice(0, 1800), allowed_mentions: { parse: [] } }) });
    return true;
  } catch (_) { return false; } finally { clearTimeout(timer); }
}

async function handleCanary(req, res, env = process.env, now = Date.now()) {
  const q = req.query || {};
  const trap = ["clone", "bait", "scan"].includes(one(q.trap)) ? one(q.trap) : "scan";
  const entry = {
    trap, ip: clientIp(req), ua: clean(req.headers && req.headers["user-agent"], 160),
    host: clean(one(q.host), 100),
    path: clean(one(q.path) || one(q.p), 160),
    ref: clean(one(q.ref) || (req.headers && req.headers.referer), 160),
  };
  const key = trap + "|" + entry.ip + "|" + entry.host;
  const dup = seen.has(key) && now - seen.get(key) < DEDUPE_MS;
  if (!dup) {
    seen.set(key, now);
    if (seen.size > 500) for (const [k, t] of seen) if (now - t > DEDUPE_MS) seen.delete(k);
    console.warn("CANARY " + JSON.stringify({ at: new Date(now).toISOString(), ...entry }));
    await notify(entry, env, now);
  }
  res.setHeader("Cache-Control", "no-store");
  if (trap === "clone") { res.setHeader("Access-Control-Allow-Origin", "*"); return res.status(204).end(); }
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  return res.status(404).send("Not Found");
}

function _reset() { seen.clear(); sent = []; }
module.exports = { handleCanary, clean, isDiscordWebhook, _reset };
