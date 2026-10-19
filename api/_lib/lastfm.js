"use strict";
/*
 * Cliente de Last.fm (user.getRecentTracks / user.getTopArtists) para la pestana "music".
 * Corre en Vercel (servidor): la API key nunca llega al navegador.
 *
 * Variables de entorno en Vercel (Settings -> Environment Variables, despues Redeploy):
 *   LASTFM_API_KEY   API key de https://www.last.fm/api/account/create
 *   LASTFM_USER      tu usuario de Last.fm (el de last.fm/user/<usuario>)
 *   LASTFM_API_URL   (opcional, solo para pruebas) base de la API; por defecto https://ws.audioscrobbler.com/2.0/
 */
const DEFAULT_URL = "https://ws.audioscrobbler.com/2.0/";
const TIMEOUT_MS = 8000;
// Last.fm devuelve esta imagen (la estrella gris) cuando una cancion no tiene portada.
const PLACEHOLDER = "2a96cbd8b46e442fc41c2b86b821562f";

class ConfigError extends Error {}

async function lastfm(method, params) {
  const key = process.env.LASTFM_API_KEY;
  const user = process.env.LASTFM_USER;
  if (!key || !user) throw new ConfigError("falta LASTFM_API_KEY o LASTFM_USER");
  const url = new URL(process.env.LASTFM_API_URL || DEFAULT_URL);
  url.search = new URLSearchParams({ method, user, api_key: key, format: "json", ...params }).toString();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: ctl.signal, cache: "no-store" });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.error) throw new Error("last.fm respondio " + res.status + (body && body.message ? ": " + body.message : ""));
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/** Mejor portada disponible (extralarge > large > medium) o null si es el placeholder. */
function pickImage(images) {
  const list = Array.isArray(images) ? images : [];
  for (const size of ["extralarge", "large", "medium", "small"]) {
    const img = list.find((i) => i && i.size === size && i["#text"]);
    if (img) return img["#text"].includes(PLACEHOLDER) ? null : img["#text"];
  }
  return null;
}

/** user.getRecentTracks -> { tracks: [...] } con el formato que espera la interfaz. */
function toTracks(raw, limit) {
  const max = Math.max(1, Math.min(parseInt(limit, 10) || 20, 50));
  const list = raw && raw.recenttracks && raw.recenttracks.track;
  const items = Array.isArray(list) ? list : list ? [list] : []; // con limit=1 Last.fm puede devolver un objeto
  return {
    tracks: items.slice(0, max).map((t) => ({
      name: t.name,
      artist: (t.artist && (t.artist.name || t.artist["#text"])) || "",
      album: (t.album && t.album["#text"]) || null,
      image: pickImage(t.image),
      url: t.url || null,
      nowPlaying: !!(t["@attr"] && String(t["@attr"].nowplaying) === "true"),
      date: t.date && t.date.uts ? Number(t.date.uts) * 1000 : null,
    })),
  };
}

/** Artista mas escuchado (ultimos 30 dias) + portada tomada de sus canciones recientes. */
function toTopArtist(rawTop, recent) {
  const arr = rawTop && rawTop.topartists && rawTop.topartists.artist;
  const first = Array.isArray(arr) ? arr[0] : arr;
  if (!first || !first.name) return {};
  const match = (recent ? recent.tracks : []).find((t) => t.artist === first.name && t.image);
  return { artist: first.name, image: match ? match.image : null };
}

/** Envuelve una funcion de Vercel: GET, cache de CDN corta y errores sin cachear. */
function route(build, { cache }) {
  return async function handler(req, res) {
    if (req.method && req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD");
      return res.status(405).json({ error: "method not allowed" });
    }
    try {
      const body = await build(req);
      res.setHeader("Cache-Control", cache);
      return res.status(200).json(body);
    } catch (err) {
      res.setHeader("Cache-Control", "no-store");
      if (err instanceof ConfigError) return res.status(503).json({ error: "lastfm not configured" });
      return res.status(502).json({ error: "lastfm unavailable" });
    }
  };
}

module.exports = { lastfm, toTracks, toTopArtist, pickImage, route, ConfigError };
