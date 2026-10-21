"use strict";
/*
 * Busca en YouTube el video de la cancion que esta sonando en Spotify para poder reproducirla en la web
 * (YouTube IFrame Player) justo en el mismo segundo.
 *
 * Variable de entorno en Vercel (Settings -> Environment Variables, despues Redeploy):
 *   YOUTUBE_API_KEY   API key de YouTube Data API v3 (console.cloud.google.com -> APIs -> YouTube Data API v3)
 *
 * Cuota: search.list cuesta 100 unidades (10 000 al dia = ~100 busquedas) y videos.list 1. Por eso el resultado
 * se guarda en el store por cancion y solo se busca una vez por cancion.
 */
const API = "https://www.googleapis.com/youtube/v3";
const TIMEOUT_MS = 8000;
const BAD_WORDS = /\b(live|cover|remix|sped up|speed up|slowed|reverb|nightcore|8d|instrumental|karaoke|lyrics? video|reaction|tutorial|mashup|acoustic|version)\b/i;

class ConfigError extends Error {}

/** "Song (feat. X) - Remastered 2011" -> "Song". */
function cleanTitle(name) {
  return String(name || "")
    .replace(/\s*[\(\[][^)\]]*(feat|ft\.|with|remaster|version|edit|live|mono|stereo)[^)\]]*[\)\]]/gi, "")
    .replace(/\s+-\s+(.*(remaster|version|edit|mono|stereo|single|live|bonus).*)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Spotify separa artistas con ";" -> usamos el primero. */
function mainArtist(artist) {
  return String(artist || "").split(/[;,]/)[0].trim();
}

function norm(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** "PT3M45S" / "PT1H2M3S" -> milisegundos. */
function parseDuration(iso) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(iso || ""));
  if (!m) return 0;
  const [d, h, mi, s] = [1, 2, 3, 4].map((i) => Number(m[i]) || 0);
  return (((d * 24 + h) * 60 + mi) * 60 + s) * 1000;
}

/**
 * Elige el mejor candidato: la duracion parecida a la de Spotify pesa mas (si el video dura distinto, el segundo
 * ya no coincide), despues que el titulo trate de la cancion y que el canal sea el artista o un "- Topic".
 * candidates: [{ videoId, title, channel, durationMs }]
 */
function pickBest(candidates, { title, artist, durationMs }) {
  const wanted = norm(cleanTitle(title));
  const who = norm(mainArtist(artist));
  const wantsBad = BAD_WORDS.exec(String(title || ""));
  let best = null;
  for (const c of candidates) {
    let score = 0;
    const t = norm(c.title);
    const ch = norm(c.channel);
    if (wanted && t.includes(wanted)) score += 40; else if (wanted) score -= 40;
    if (who && (t.includes(who) || ch.includes(who))) score += 25;
    if (/ topic$/.test(ch)) score += 15;
    if (/official (audio|music video|video)|audio/.test(String(c.title).toLowerCase())) score += 5;
    if (!wantsBad && BAD_WORDS.test(c.title)) score -= 50;
    if (durationMs && c.durationMs) {
      const diff = Math.abs(c.durationMs - durationMs) / 1000;
      score += diff <= 2 ? 60 : diff <= 5 ? 35 : diff <= 10 ? 10 : -Math.min(80, diff);
    }
    if (!best || score > best.score) best = { ...c, score };
  }
  if (!best) return null;
  // sin ninguna pista de que sea la cancion no devolvemos nada (mejor silencio que otra cancion)
  if (best.score < 0) return null;
  return best;
}

async function getJson(url, fetchImpl) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { headers: { Accept: "application/json" }, signal: ctl.signal, cache: "no-store" });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body) {
      const reason = body && body.error && body.error.message ? ": " + body.error.message : "";
      throw new Error("youtube respondio " + res.status + reason);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/** search.list (5 resultados) + videos.list (duraciones) -> mejor video o null. */
async function findVideo({ title, artist, durationMs }, { key = process.env.YOUTUBE_API_KEY, fetchImpl = fetch, base = process.env.YOUTUBE_API_URL || API } = {}) {
  if (!key) throw new ConfigError("falta YOUTUBE_API_KEY");
  const q = [mainArtist(artist), cleanTitle(title), "audio"].filter(Boolean).join(" ");
  const search = new URL(base + "/search");
  search.search = new URLSearchParams({ part: "snippet", type: "video", videoCategoryId: "10", maxResults: "5", videoEmbeddable: "true", q, key }).toString();
  const found = await getJson(search, fetchImpl);
  const items = (found.items || []).filter((i) => i && i.id && i.id.videoId);
  if (!items.length) return null;
  const videos = new URL(base + "/videos");
  videos.search = new URLSearchParams({ part: "contentDetails", id: items.map((i) => i.id.videoId).join(","), key }).toString();
  const details = await getJson(videos, fetchImpl);
  const dur = new Map((details.items || []).map((v) => [v.id, parseDuration(v.contentDetails && v.contentDetails.duration)]));
  const candidates = items.map((i) => ({ videoId: i.id.videoId, title: i.snippet && i.snippet.title || "", channel: i.snippet && i.snippet.channelTitle || "", durationMs: dur.get(i.id.videoId) || 0 }));
  const best = pickBest(candidates, { title, artist, durationMs });
  return best ? { videoId: best.videoId, title: best.title, channel: best.channel, durationMs: best.durationMs } : null;
}

module.exports = { findVideo, pickBest, cleanTitle, mainArtist, parseDuration, norm, ConfigError };
