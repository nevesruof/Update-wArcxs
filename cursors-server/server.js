"use strict";
const http = require("node:http");
const crypto = require("node:crypto");
const { WebSocketServer } = require("ws");

const PALETTE = ["#8dcfd7", "#f9a8d4", "#c4b5fd", "#86efac", "#fcd34d", "#fda4af", "#93c5fd", "#fdba74"];
const REACTIONS = new Set(["\uD83D\uDC4B", "\u2764\uFE0F", "\uD83D\uDE02", "\uD83E\uDEE7"]);
const SCENES = /^[a-z0-9_-]{1,20}$/i;
const CONTROL = /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2028\u2029\u2066-\u2069\ufeff]/g;

function verifyOwnerToken(token, secret, now = Date.now()) {
  const m = /^v1\.(\d{10,16})\.([0-9a-f]{64})$/.exec(String(token || ""));
  if (!m || !secret || Number(m[1]) < now) return false;
  const good = crypto.createHmac("sha256", secret).update("owner." + m[1]).digest();
  return crypto.timingSafeEqual(Buffer.from(m[2], "hex"), good);
}
const text = (v, max) => [...String(v == null ? "" : v).normalize("NFC").replace(CONTROL, "").replace(/\s+/g, " ").trim()].slice(0, max).join("");
const num01 = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null);

function createCursorServer(opts = {}) {
  const env = opts.env || process.env;
  const secret = opts.secret !== undefined ? opts.secret : env.CURSOR_SECRET;
  const allowed = String(opts.allowedOrigins !== undefined ? opts.allowedOrigins : env.ALLOWED_ORIGINS || "")
    .split(",").map((s) => s.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "")).filter(Boolean);
  const trustProxy = opts.trustProxy !== undefined ? opts.trustProxy : env.TRUST_PROXY === "1";
  const maxPerIp = opts.maxPerIp || 6, maxTotal = opts.maxTotal || 300;

  const clients = new Map();
  const perIp = new Map();
  const server = http.createServer((req, res) => {
    res.writeHead(req.url === "/health" ? 200 : 404, { "Content-Type": "text/plain" });
    res.end(req.url === "/health" ? "ok" : "Not Found");
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });

  function originOk(origin) {
    if (!allowed.length) return true;
    try { return allowed.includes(new URL(origin).host.toLowerCase()); } catch (_) { return false; }
  }
  function clientIp(req) {
    const fwd = trustProxy && String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    return fwd || req.socket.remoteAddress || "?";
  }
  const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
  const peers = (me) => [...clients].filter(([ws, c]) => ws !== me.ws && c.path === me.path);
  const cursorMsg = (c) => ({ type: "cursor", id: c.id, x: c.x, y: c.y, label: c.label, color: c.color, owner: c.owner, scene: c.scene });
  const identity = (c) => ({ type: "identity", id: c.id, label: c.label, color: c.color, owner: c.owner });

  function setProfile(c, p) {
    const token = typeof p.visitorToken === "string" && /^[0-9a-f-]{36}$/i.test(p.visitorToken) ? p.visitorToken : c.id;
    c.color = PALETTE[crypto.createHash("sha256").update(token).digest()[0] % PALETTE.length];
    c.owner = verifyOwnerToken(p.ownerToken, secret);
    let nick = text(p.nickname, 20).replace(/[^\p{L}\p{N} _.-]/gu, "").trim();
    if (!c.owner && /^take$/i.test(nick)) nick = "";
    c.label = c.owner ? "take" : nick || "guest-" + c.id.slice(0, 4);
  }
  function leaveRoute(c) { for (const [ws] of peers(c)) send(ws, { type: "leave", id: c.id }); }
  function joinRoute(c) {
    for (const [ws, o] of peers(c)) { if (o.x != null) send(c.ws, cursorMsg(o)); }
    if (c.x != null) for (const [ws] of peers(c)) send(ws, cursorMsg(c));
  }
  function error(c, message) { send(c.ws, { type: "error", message }); }

  function onMessage(c, raw) {
    const now = Date.now();
    if (now - c.windowStart > 1000) { c.windowStart = now; c.count = 0; }
    if (++c.count > 80) return c.ws.close(1008, "rate limit");
    let m; try { m = JSON.parse(raw); } catch (_) { return; }
    if (!m || typeof m.type !== "string") return;
    switch (m.type) {
      case "profile": setProfile(c, m); send(c.ws, identity(c)); if (c.x != null) for (const [ws] of peers(c)) send(ws, cursorMsg(c)); break;
      case "route": {
        const path = typeof m.path === "string" && m.path.startsWith("/") ? text(m.path, 100) : "/";
        if (path === c.path) break;
        leaveRoute(c); c.path = path; c.x = c.y = null; break;
      }
      case "scene": if (typeof m.scene === "string" && SCENES.test(m.scene)) { c.scene = m.scene; for (const [ws] of peers(c)) send(ws, { type: "scene", id: c.id, scene: c.scene }); } break;
      case "move": {
        const x = num01(m.x), y = num01(m.y);
        if (x == null || y == null || now - c.lastMove < 25) break;
        c.lastMove = now; c.x = x; c.y = y;
        for (const [ws] of peers(c)) send(ws, cursorMsg(c));
        break;
      }
      case "click": {
        const x = num01(m.x), y = num01(m.y);
        if (x == null || y == null || now - c.lastClick < 120) break;
        c.lastClick = now;
        for (const [ws] of peers(c)) send(ws, { type: "click", id: c.id, x, y, color: c.color, owner: c.owner, scene: c.scene });
        break;
      }
      case "idle": c.x = c.y = null; leaveRoute(c); break;
      case "chat": case "reaction": {
        const isReaction = m.type === "reaction";
        if (now - c.lastSpeech < (isReaction ? 650 : 1200)) return error(c, "Wait a moment before sending again.");
        const t = isReaction ? (REACTIONS.has(m.text) ? m.text : "") : text(m.text, 120);
        if (!t) break;
        c.lastSpeech = now;
        const msg = { type: "speech", id: c.id, text: t, ...(isReaction ? { reaction: t } : {}), x: c.x == null ? 0.5 : c.x, y: c.y == null ? 0.5 : c.y };
        send(c.ws, msg);
        for (const [ws] of peers(c)) send(ws, msg);
        break;
      }
      default: break;
    }
  }

  server.on("upgrade", (req, socket, head) => {
    const url = String(req.url || "").split("?")[0];
    const ip = clientIp(req);
    const refuse = (code, why) => { socket.write("HTTP/1.1 " + code + " " + why + "\r\nConnection: close\r\n\r\n"); socket.destroy(); };
    if (url !== "/api/cursors" && url !== "/") return refuse(404, "Not Found");
    if (!originOk(req.headers.origin || "")) return refuse(403, "Forbidden");
    if (clients.size >= maxTotal || (perIp.get(ip) || 0) >= maxPerIp) return refuse(429, "Too Many Requests");
    wss.handleUpgrade(req, socket, head, (ws) => {
      const c = { ws, ip, id: crypto.randomBytes(4).toString("hex"), path: "/", scene: "underwater", x: null, y: null,
        label: "", color: PALETTE[0], owner: false, alive: true, windowStart: Date.now(), count: 0, lastMove: 0, lastClick: 0, lastSpeech: 0 };
      setProfile(c, {});
      clients.set(ws, c); perIp.set(ip, (perIp.get(ip) || 0) + 1);
      send(ws, identity(c));
      ws.on("pong", () => { c.alive = true; });
      ws.on("message", (raw) => onMessage(c, raw.toString("utf8")));
      ws.on("error", () => {});
      ws.on("close", () => {
        leaveRoute(c); clients.delete(ws);
        const n = (perIp.get(ip) || 1) - 1; if (n > 0) perIp.set(ip, n); else perIp.delete(ip);
      });
    });
  });

  const beat = setInterval(() => {
    for (const [ws, c] of clients) { if (!c.alive) { ws.terminate(); continue; } c.alive = false; try { ws.ping(); } catch (_) {} }
  }, 30000);
  beat.unref();

  return {
    server, wss, clients,
    listen: (port = 8787, host) => new Promise((ok) => server.listen(port, host, () => ok(server.address().port))),
    close: () => new Promise((ok) => { clearInterval(beat); for (const ws of wss.clients) ws.terminate(); wss.close(() => server.close(() => ok())); }),
  };
}

if (require.main === module) {
  const app = createCursorServer();
  const port = Number(process.env.PORT) || 8787;
  app.listen(port).then((p) => console.log("take-cursors escuchando en el puerto " + p + " (ruta /api/cursors)"));
  if (!process.env.ALLOWED_ORIGINS) console.warn("AVISO: ALLOWED_ORIGINS vacio: cualquier sitio puede conectarse.");
  if (!process.env.CURSOR_SECRET) console.warn("AVISO: sin CURSOR_SECRET nadie sera reconocido como dueno.");
}
module.exports = { createCursorServer, verifyOwnerToken };
