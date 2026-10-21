"use strict";
/*
 * Busca en YouTube el video de una cancion para "escuchar a la par" (misma cancion, mismo segundo).
 * Usa la YouTube Data API v3 con la llave en la variable de entorno YOUTUBE_API_KEY (solo en el servidor:
 * nunca se envia al navegador ni se escribe en los logs).
 * Cuesta ~101 unidades de cuota por cancion nueva (la cuota gratuita diaria es 10,000); por eso se cachea todo.
 */
const API = "https://www.googleapis.com/youtube/v3";

function parseIsoDuration(s) {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(s || ""));
  if (!m) return null;
  return (Number(m[1] || 0) * 86400) + (Number(m[2] || 0) * 3600) + (Number(m[3] || 0) * 60) + Number(m[4] || 0);
}

const BAD = /\b(live|cover|remix|sped up|slowed|reverb|8d|karaoke|nightcore|acoustic|instrumental|tutorial|reaction)\b/i;

/** Menor es mejor: diferencia de duracion, + canal "Topic" (audio oficial de album, igual al de Spotify), - penaliza versiones raras. */
function score(c, durationSec, wantedTitle) {
  let s = durationSec && c.durationSec != null ? Math.abs(c.durationSec - durationSec) : 30;
  if (/ - topic$/i.test(c.channel || "")) s -= 2.5;
  if (/official audio/i.test(c.title || "")) s -= 1;
  if (BAD.test(c.title || "") && !BAD.test(wantedTitle || "")) s += 8;
  return s;
}

async function api(path, params, fetchImpl) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6000);
  try {
    const res = await fetchImpl(API + path + "?" + new URLSearchParams(params), { signal: ctl.signal });
    if (!res.ok) { const e = new Error("youtube " + res.status); e.status = res.status; throw e; }   // sin la URL: lleva la llave
    return await res.json();
  } finally { clearTimeout(timer); }
}

async function findVideo({ artist, track, durationSec }, env = process.env, fetchImpl = fetch) {
  const key = env.YOUTUBE_API_KEY;
  if (!key) return { enabled: false };
  const found = await api("/search", { part: "snippet", type: "video", videoEmbeddable: "true", videoCategoryId: "10", maxResults: "6", q: artist + " - " + track, key }, fetchImpl);
  const ids = (found.items || []).map((i) => i.id && i.id.videoId).filter(Boolean);
  if (!ids.length) return { enabled: true, videoId: null, reason: "no-match" };
  const det = await api("/videos", { part: "contentDetails,status,snippet", id: ids.join(","), key }, fetchImpl);
  const cands = (det.items || [])
    .filter((v) => !v.status || v.status.embeddable !== false)
    .map((v) => ({ videoId: v.id, title: v.snippet && v.snippet.title, channel: v.snippet && v.snippet.channelTitle, durationSec: parseIsoDuration(v.contentDetails && v.contentDetails.duration) }));
  if (!cands.length) return { enabled: true, videoId: null, reason: "not-embeddable" };
  cands.sort((a, b) => score(a, durationSec, track) - score(b, durationSec, track));
  const c = cands[0];
  const diffSec = durationSec && c.durationSec != null ? Math.abs(c.durationSec - durationSec) : null;
  return { enabled: true, videoId: c.videoId, title: c.title, channel: c.channel, durationSec: c.durationSec, diffSec, ok: diffSec != null && diffSec <= 4 };
}

module.exports = { findVideo, parseIsoDuration, score };
