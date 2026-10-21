"use strict";
// GET /api/listen?artist=&track=&duration=<segundos>  ->  { enabled, videoId, ok, diffSec, ... }  (YouTube, "escuchar a la par")
const { findVideo } = require("./_lib/youtube");
const memo = new Map();

module.exports = async function handler(req, res, fetchImpl = fetch, env = process.env) {
  if (req.method && req.method !== "GET" && req.method !== "HEAD") { res.setHeader("Allow", "GET, HEAD"); return res.status(405).json({ error: "method not allowed" }); }
  if (!env.YOUTUBE_API_KEY) { res.setHeader("Cache-Control", "public, s-maxage=300"); return res.status(200).json({ enabled: false }); }
  const q = req.query || {}, one = (v) => String(Array.isArray(v) ? v[0] : v || "").slice(0, 140).trim();
  const artist = one(q.artist), track = one(q.track);
  const durationSec = Math.min(Math.max(Number(one(q.duration)) || 0, 0), 3600);
  if (!artist || !track) return res.status(400).json({ error: "artist and track are required" });
  const key = [artist, track, Math.round(durationSec)].join("|").toLowerCase();
  try {
    let out = memo.get(key);
    if (!out) { out = await findVideo({ artist, track, durationSec }, env, fetchImpl); if (out.videoId) { memo.set(key, out); if (memo.size > 300) memo.delete(memo.keys().next().value); } }
    res.setHeader("Cache-Control", out.videoId ? "public, s-maxage=86400, stale-while-revalidate=604800" : "public, s-maxage=600");
    return res.status(200).json(out);
  } catch (e) {
    res.setHeader("Cache-Control", "public, s-maxage=300");
    return res.status(200).json({ enabled: true, videoId: null, reason: e && e.status === 403 ? "quota" : "error" });
  }
};
module.exports._memo = memo;
