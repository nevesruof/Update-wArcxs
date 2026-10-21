"use strict";
// GET /api/lyrics?artist=&track=&album=&duration=<segundos>  ->  { found, synced:[{t,text}], plain, instrumental }
const { lookupLyrics } = require("./_lib/lyrics");
const memo = new Map();

module.exports = async function handler(req, res, fetchImpl = fetch) {
  if (req.method && req.method !== "GET" && req.method !== "HEAD") { res.setHeader("Allow", "GET, HEAD"); return res.status(405).json({ error: "method not allowed" }); }
  const q = req.query || {}, one = (v) => String(Array.isArray(v) ? v[0] : v || "").slice(0, 140).trim();
  const artist = one(q.artist), track = one(q.track), album = one(q.album);
  const durationSec = Math.min(Math.max(Number(one(q.duration)) || 0, 0), 3600);
  if (!artist || !track) return res.status(400).json({ error: "artist and track are required" });
  const key = [artist, track, Math.round(durationSec / 3)].join("|").toLowerCase();
  try {
    let out = memo.get(key);
    if (!out) { out = await lookupLyrics({ artist, track, album, durationSec }, fetchImpl); memo.set(key, out); if (memo.size > 200) memo.delete(memo.keys().next().value); }
    res.setHeader("Cache-Control", out.found ? "public, s-maxage=86400, stale-while-revalidate=604800" : "public, s-maxage=3600");
    return res.status(200).json(out);
  } catch (_) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ found: false, error: "lyrics unavailable" });
  }
};
module.exports._memo = memo;
