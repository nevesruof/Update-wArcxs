"use strict";
/*
 * Puente entre la web y el bot de actividad (bot/main.py -> GET /api/activity).
 *
 * El bot corre en su hosting; estas funciones corren en Vercel (servidor). Asi el token del bot
 * nunca llega al navegador y no hay problemas de CORS ni de contenido mixto (http/https).
 *
 * Variables de entorno en Vercel (Settings -> Environment Variables):
 *   ACTIVITY_BOT_URL    URL completa del bot terminada en /api/activity
 *                       (por defecto http://fi4.bot-hosting.cloud:25319/api/activity)
 *   ACTIVITY_BOT_TOKEN  mismo valor que API_TOKEN del bot (solo si el bot lo tiene configurado)
 */
const DEFAULT_URL = "http://fi4.bot-hosting.cloud:25319/api/activity";
const TIMEOUT_MS = 8000;
const STATUSES = new Set(["online", "idle", "dnd", "offline"]);

async function fetchSnapshot() {
  const url = process.env.ACTIVITY_BOT_URL || DEFAULT_URL;
  const headers = { Accept: "application/json" };
  if (process.env.ACTIVITY_BOT_TOKEN) headers.Authorization = "Bearer " + process.env.ACTIVITY_BOT_TOKEN;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: ctl.signal, cache: "no-store" });
    if (!res.ok) throw new Error("el bot respondio " + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function cdnImage(kind, profile) {
  const key = profile && profile[kind];
  if (!profile || !profile.id || !key) return null;
  const ext = String(key).startsWith("a_") ? "gif" : "png";
  const path = kind === "avatar" ? "avatars" : "banners";
  return "https://cdn.discordapp.com/" + path + "/" + profile.id + "/" + key + "." + ext + "?size=" + (kind === "avatar" ? 128 : 600);
}

function userInfo(profile) {
  const p = profile || {};
  return {
    username: p.username || null,
    display_name: p.global_name || p.username || null,
    avatar: cdnImage("avatar", p),
    banner: cdnImage("banner", p),
    public_flags: 0,
    badges: [],
    fontId: null,
  };
}

/** Estado vacio: se usa cuando el bot no responde o Discord no lo conoce (el bot lo marca "unknown"). */
function offlinePresence(profile) {
  return {
    discord_status: "offline",
    activities: [],
    custom_status: null,
    discord_user: userInfo(profile),
    listening_to_spotify: false,
    spotify: null,
  };
}

/** Respuesta del bot -> mismo formato que antes entregaba Lanyard (lo que espera la interfaz). */
function toPresence(raw) {
  const d = (raw && raw.discord) || {};
  const profile = raw && raw.profile;
  if (!STATUSES.has(d.status) || d.status === "offline") return offlinePresence(profile);

  const list = Array.isArray(d.activities) ? d.activities : [];
  const custom = list.find((a) => a.type === 4);
  const music = list.find((a) => a.kind === "spotify");
  return {
    discord_status: d.status,
    activities: list
      .filter((a) => a.type !== 4 && a.kind !== "spotify")
      .map((a) => ({
        name: a.name,
        type: a.type,
        details: a.details || null,
        state: a.state || null,
        largeImage: a.image || null,
        largeText: a.largeText || null,
        smallImage: null,
        smallText: null,
        applicationId: a.applicationId || null,
        startTimestamp: a.startMs || null,
      })),
    custom_status: custom ? { text: custom.state || null, emoji: null } : null,
    discord_user: userInfo(profile),
    listening_to_spotify: !!music,
    spotify: music
      ? {
          song: music.name,
          artist: music.artist,
          album: music.album,
          albumArt: music.image || null,
          startTimestamp: music.startMs || null,
          endTimestamp: music.endMs || null,
        }
      : null,
  };
}

/** Historial de Spotify del bot -> { tracks: [...] } (lista "on repeat" de la pestana music). */
function toTracks(raw, limit) {
  const max = Math.max(1, Math.min(parseInt(limit, 10) || 20, 50));
  const songs = Array.isArray(raw && raw.recentSongs) ? raw.recentSongs : [];
  return {
    tracks: songs.slice(0, max).map((s) => ({
      name: s.name,
      artist: s.artist,
      album: s.album || null,
      image: s.image || null,
      nowPlaying: !!s.active,
      date: Math.round((s.lastSeen || s.firstSeen || 0) * 1000) || null,
    })),
  };
}

/** Artista mas escuchado dentro del historial reciente que entrega el bot (hasta 100 canciones). */
function toTopArtist(raw) {
  const songs = Array.isArray(raw && raw.recentSongs) ? raw.recentSongs : [];
  const count = new Map();
  for (const s of songs) {
    const main = String(s.artist || "").split(";")[0].trim();
    if (!main) continue;
    const entry = count.get(main) || { n: 0, image: null };
    entry.n += 1;
    if (!entry.image && s.image) entry.image = s.image; // portada de la cancion mas reciente de ese artista
    count.set(main, entry);
  }
  let best = null;
  for (const [artist, e] of count) if (!best || e.n > best.n) best = { artist, n: e.n, image: e.image };
  return best ? { artist: best.artist, image: best.image } : {};
}

/** Envuelve una funcion de Vercel: GET, cache de CDN corta y errores sin cachear. */
function route(build, { cache, onError }) {
  return async function handler(req, res) {
    if (req.method && req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD");
      return res.status(405).json({ error: "method not allowed" });
    }
    try {
      const body = await build(await fetchSnapshot(), req);
      res.setHeader("Cache-Control", cache);
      return res.status(200).json(body);
    } catch (err) {
      res.setHeader("Cache-Control", "no-store");
      const fallback = onError ? await onError(err) : null;
      if (fallback) return res.status(200).json(fallback);
      return res.status(502).json({ error: "bot unavailable" });
    }
  };
}

module.exports = { fetchSnapshot, toPresence, offlinePresence, toTracks, toTopArtist, route };
