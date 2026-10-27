"use strict";
const crypto = require("node:crypto");
const { getStore } = require("./store");

const LIMITS = { name: 50, website: 200, message: 200, reply: 500, home: 200, maxEntries: 1000 };
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2028\u2029\u2066-\u2069\ufeff]/g;
const GB = "take:gb", GB_LIKES = "take:gb:likes";

function clean(v, max, multiline = false) {
  let s = String(v == null ? "" : v).normalize("NFC").replace(CONTROL, "");
  s = multiline ? s.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n") : s.replace(/\s+/g, " ");
  return [...s.trim()].slice(0, max).join("");
}
function reply(res, status, body, extra) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (extra) for (const k of Object.keys(extra)) res.setHeader(k, extra[k]);
  return res.status(status).json(body);
}
const notAllowed = (res, allow) => reply(res, 405, { error: "method not allowed" }, { Allow: allow.join(", ") });
function readBody(req) {
  let b = req.body;
  if (Buffer.isBuffer(b)) b = b.toString("utf8");
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (_) { return {}; } }
  if (!b || typeof b !== "object" || Array.isArray(b)) return {};
  return JSON.stringify(b).length > 6000 ? {} : b;
}
function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
function addCookie(res, value) {
  const prev = res.getHeader && res.getHeader("Set-Cookie");
  res.setHeader("Set-Cookie", [].concat(prev || [], value));
}
function cookieAttrs(req, maxAge) {
  const https = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
  return "; Path=/; Max-Age=" + maxAge + "; HttpOnly; SameSite=Lax" + (https ? "; Secure" : "");
}
function visitorId(req, res) {
  const c = parseCookies(req)["tk-vid"];
  if (c && /^[0-9a-f-]{36}$/i.test(c)) return c;
  const id = crypto.randomUUID();
  addCookie(res, "tk-vid=" + id + cookieAttrs(req, 31536000));
  return id;
}
function ipHash(req, env) {
  const raw = String(req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "").split(",")[0].trim()
    || (req.socket && req.socket.remoteAddress) || "?";
  return crypto.createHash("sha256").update((env.IP_SALT || env.ADMIN_KEY || "take") + "|" + raw).digest("hex").slice(0, 16);
}
function normalizeUrl(v) {
  try {
    const u = new URL(String(v).trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.username || u.password || !u.hostname.includes(".")) return null;
    return u.href.length <= LIMITS.website ? u.href : null;
  } catch (_) { return null; }
}

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest();
const adminConfigured = (env) => typeof env.ADMIN_KEY === "string" && env.ADMIN_KEY.length >= 12;
function keyMatches(req, env) {
  const given = req.headers["x-admin-key"];
  return adminConfigured(env) && typeof given === "string" && crypto.timingSafeEqual(sha(given), sha(env.ADMIN_KEY));
}
async function adminCheck(req, store, env) {
  if (!adminConfigured(env)) return "disabled";
  const key = "take:rl:admin:" + ipHash(req, env);
  if ((Number(await store.get(key)) || 0) >= 8) return "limited";
  if (keyMatches(req, env)) return "ok";
  await store.hit(key, 600);
  return "denied";
}
function adminDenied(res, state) {
  if (state === "limited") return reply(res, 429, { error: "Too many attempts. Try again in a few minutes" });
  if (state === "disabled") return reply(res, 503, { error: "Admin is not configured" });
  return reply(res, 401, { error: "Unauthorized" });
}
function signOwnerToken(secret, now = Date.now(), ttlMs = 12 * 3600e3) {
  const exp = now + ttlMs;
  return "v1." + exp + "." + crypto.createHmac("sha256", secret).update("owner." + exp).digest("hex");
}
function verifyOwnerToken(token, secret, now = Date.now()) {
  const m = /^v1\.(\d{10,16})\.([0-9a-f]{64})$/.exec(String(token || ""));
  if (!m || !secret || Number(m[1]) < now) return false;
  const good = crypto.createHmac("sha256", secret).update("owner." + m[1]).digest();
  return crypto.timingSafeEqual(Buffer.from(m[2], "hex"), good);
}

const publicEntry = (e, likes, liked) => ({
  id: e.id, name: e.name, ...(e.website ? { website: e.website } : {}), message: e.message,
  timestamp: e.timestamp, likes: likes || 0, liked: !!liked, ownerLiked: !!e.ownerLiked, reply: e.reply || null,
});
async function loadEntries(store) {
  const all = await store.hgetall(GB);
  return Object.values(all || {}).map((v) => { try { return JSON.parse(v); } catch (_) { return null; } })
    .filter(Boolean).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
}

async function guestbook(req, res, env = process.env, store = getStore(env)) {
  try {
    if (req.method === "GET") {
      const vid = visitorId(req, res);
      const [entries, likes, mine] = await Promise.all([loadEntries(store), store.hgetall(GB_LIKES), store.smembers("take:gb:liked:" + vid)]);
      const liked = new Set(mine);
      return reply(res, 200, entries.slice(0, 300).map((e) => publicEntry(e, Number(likes[e.id]), liked.has(e.id))));
    }
    if (req.method === "POST") {
      const b = readBody(req);
      if (String(b.message || "").trim().length > LIMITS.message) return reply(res, 400, { error: "That message is too long" });
      const message = clean(b.message, LIMITS.message, true);
      if (!message) return reply(res, 400, { error: "Write a message first" });
      if ((message.match(/https?:\/\//gi) || []).length > 2) return reply(res, 400, { error: "Too many links in one message" });
      let website;
      if (b.website) { website = normalizeUrl(b.website); if (!website) return reply(res, 400, { error: "That website URL isn't valid" }); }
      const vid = visitorId(req, res);
      if (!(await store.claim("take:rl:gbpost:" + vid, 20))) return reply(res, 429, { error: "Wait a few seconds before posting again" });
      if ((await store.hit("take:rl:gbhour:" + ipHash(req, env), 3600)) > 6) return reply(res, 429, { error: "Too many messages from your network. Try again later" });
      const entry = {
        id: Date.now().toString(36) + crypto.randomBytes(3).toString("hex"),
        name: clean(b.name, LIMITS.name) || "Anonymous", website, message, timestamp: new Date().toISOString(),
      };
      await store.hset(GB, entry.id, JSON.stringify(entry));
      if ((await store.hlen(GB)) > LIMITS.maxEntries) {
        const old = (await loadEntries(store)).slice(LIMITS.maxEntries);
        for (const o of old) { await store.hdel(GB, o.id); }
      }
      return reply(res, 201, publicEntry(entry, 0, false));
    }
    if (req.method === "PATCH") {
      const b = readBody(req);
      const id = String(b.id || "");
      if (!/^[a-z0-9]{6,24}$/.test(id)) return reply(res, 400, { error: "Invalid id" });
      const raw = await store.hget(GB, id);
      if (!raw) return reply(res, 404, { error: "Message not found" });
      const entry = JSON.parse(raw);
      if (!b.action) {
        if ((await store.hit("take:rl:like:" + ipHash(req, env), 3600)) > 60) return reply(res, 429, { error: "Too many likes. Try again later" });
        const vid = visitorId(req, res);
        const added = await store.sadd("take:gb:liked:" + vid, id);
        const likes = added ? await store.hincrby(GB_LIKES, id, 1) : Number(await store.hget(GB_LIKES, id)) || 0;
        return reply(res, 200, { id, likes, liked: true });
      }
      const state = await adminCheck(req, store, env);
      if (state !== "ok") return adminDenied(res, state);
      if (b.action === "owner-like") entry.ownerLiked = !entry.ownerLiked;
      else if (b.action === "reply") {
        if (String(b.reply || "").trim().length > LIMITS.reply) return reply(res, 400, { error: "That reply is too long" });
        entry.reply = clean(b.reply, LIMITS.reply, true) || null;
      } else return reply(res, 400, { error: "Unknown action" });
      await store.hset(GB, id, JSON.stringify(entry));
      return reply(res, 200, publicEntry(entry, Number(await store.hget(GB_LIKES, id)) || 0, false));
    }
    return notAllowed(res, ["GET", "POST", "PATCH"]);
  } catch (e) {
    console.error("guestbook:", e && e.message);
    return reply(res, 500, { error: "Server error" });
  }
}

const DEFAULT_VISITS_BASE = 18786;
function visitsBase(env) {
  const raw = env.VISITS_BASE;
  if (raw === undefined || raw === "") return DEFAULT_VISITS_BASE;
  return Number(raw) || 0;
}
async function counter(req, res, env = process.env, store = getStore(env)) {
  if (req.method !== "GET" && req.method !== "HEAD") return notAllowed(res, ["GET", "HEAD"]);
  try {
    let count;
    if (parseCookies(req)["tk-seen"] || req.method === "HEAD") count = Number(await store.get("take:visits")) || 0;
    else { count = await store.incr("take:visits"); addCookie(res, "tk-seen=1" + cookieAttrs(req, 43200)); }
    return reply(res, 200, { count: count + visitsBase(env) });
  } catch (e) {
    console.error("counter:", e && e.message);
    return reply(res, 500, { error: "Server error" });
  }
}

async function settings(req, res, env = process.env, store = getStore(env)) {
  try {
    if (req.method === "GET") {
      const saved = await store.get("take:home-message");
      return reply(res, 200, { homeMessage: saved != null ? saved : clean(env.HOME_MESSAGE, LIMITS.home) });
    }
    if (req.method === "PUT" || req.method === "POST" || req.method === "PATCH") {
      const state = await adminCheck(req, store, env);
      if (state !== "ok") return adminDenied(res, state);
      const b = readBody(req);
      if (typeof b.homeMessage !== "string" || b.homeMessage.length > LIMITS.home) return reply(res, 400, { error: "homeMessage must be text of up to " + LIMITS.home + " characters" });
      const msg = clean(b.homeMessage, LIMITS.home);
      await store.set("take:home-message", msg);
      return reply(res, 200, { homeMessage: msg });
    }
    return notAllowed(res, ["GET", "PUT"]);
  } catch (e) {
    console.error("settings:", e && e.message);
    return reply(res, 500, { error: "Server error" });
  }
}

async function adminVerify(req, res, env = process.env, store = getStore(env)) {
  if (req.method !== "POST") return notAllowed(res, ["POST"]);
  try {
    const state = await adminCheck(req, store, env);
    return state === "ok" ? reply(res, 200, { ok: true }) : adminDenied(res, state);
  } catch (e) { console.error("admin:", e && e.message); return reply(res, 500, { error: "Server error" }); }
}
async function cursorToken(req, res, env = process.env, store = getStore(env)) {
  if (req.method !== "POST") return notAllowed(res, ["POST"]);
  try {
    const state = await adminCheck(req, store, env);
    if (state !== "ok") return adminDenied(res, state);
    return reply(res, 200, { token: signOwnerToken(env.CURSOR_SECRET || env.ADMIN_KEY) });
  } catch (e) { console.error("cursor-token:", e && e.message); return reply(res, 500, { error: "Server error" }); }
}

module.exports = { guestbook, counter, settings, adminVerify, cursorToken, signOwnerToken, verifyOwnerToken, clean, normalizeUrl, LIMITS };
