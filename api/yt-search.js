"use strict";
// GET /api/yt-search -> { track, video } del video de YouTube para la cancion que suena AHORA en tu Discord/Spotify.
// No acepta consultas del visitante: busca solo lo que el bot dice que estas escuchando, asi nadie puede gastar la cuota.
// El resultado se guarda en el store por cancion (solo se busca una vez por cancion).
const { fetchSnapshot, toPresence } = require("./_lib/bot");
const { findVideo, norm, ConfigError } = require("./_lib/youtube");
const { getStore } = require("./_lib/store");

const DAILY_SEARCHES = 90; // search.list cuesta 100 de 10 000 unidades diarias: dejamos margen

function dayKey(now = Date.now()) { return new Date(now).toISOString().slice(0, 10); }

async function lookup(spotify, { store = getStore(), find = findVideo, now = Date.now } = {}) {
  const key = "take:yt:" + norm(spotify.artist) + ":" + norm(spotify.song);
  const cached = await store.get(key).catch(() => null);
  if (cached) { try { return JSON.parse(cached); } catch (e) { /* se vuelve a buscar */ } }
  const used = await store.hit("take:yt:searches:" + dayKey(now()), 86400).catch(() => 0);
  if (used > DAILY_SEARCHES) { const err = new Error("cuota diaria"); err.status = 429; throw err; }
  const durationMs = spotify.endTimestamp && spotify.startTimestamp ? spotify.endTimestamp - spotify.startTimestamp : 0;
  const video = await find({ title: spotify.song, artist: spotify.artist, durationMs });
  const result = { video: video || null };
  await store.set(key, JSON.stringify(result)).catch(() => { });
  return result;
}

async function handler(req, res) {
  if (req.method && req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");
  try {
    const presence = toPresence(await fetchSnapshot());
    const sp = presence.spotify;
    if (!sp || !sp.song) return res.status(200).json({ track: null, video: null });
    const { video } = await lookup(sp);
    res.setHeader("Cache-Control", "public, s-maxage=5, stale-while-revalidate=10");
    return res.status(200).json({ track: { song: sp.song, artist: sp.artist, startTimestamp: sp.startTimestamp, endTimestamp: sp.endTimestamp }, video });
  } catch (err) {
    if (err instanceof ConfigError) return res.status(503).json({ error: "youtube not configured" });
    if (err && err.status === 429) return res.status(429).json({ error: "daily limit reached" });
    console.error("yt-search:", err && err.message);
    return res.status(502).json({ error: "search failed" });
  }
}

module.exports = handler;
module.exports.lookup = lookup;
