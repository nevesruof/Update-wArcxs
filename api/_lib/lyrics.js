"use strict";
/*
 * Letras sincronizadas para la tarjeta "now playing".
 * Fuente: LRCLIB (https://lrclib.net), base comunitaria y gratuita con letras en formato LRC (linea + tiempo).
 * Las letras pertenecen a sus autores; aqui solo se consultan en el momento y no se guardan en el repositorio.
 */
const BASE = "https://lrclib.net/api";
const UA = "take-site/1.0 (https://github.com/nevesruof/Update-wArcxs)";
const MAX_LINES = 400;

/** "[01:23.45] texto" -> [{ t: ms, text }] (ordenado). Ignora etiquetas [ar:], [ti:]... y lineas sin tiempo. */
function parseLrc(text) {
  const out = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!stamps.length) continue;
    const line = raw.replace(/\[[^\]]*\]/g, "").replace(/<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g, "").replace(/\s+/g, " ").trim();
    for (const m of stamps) {
      const frac = m[3] ? Number((m[3] + "00").slice(0, 3)) : 0;
      out.push({ t: Number(m[1]) * 60000 + Number(m[2]) * 1000 + frac, text: line });
    }
  }
  out.sort((a, b) => a.t - b.t);
  return out.slice(0, MAX_LINES);
}

async function getJson(url, fetchImpl, ms = 6000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetchImpl(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: ctl.signal });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("lrclib " + res.status);
    return await res.json();
  } finally { clearTimeout(timer); }
}

/** Elige el resultado con letra sincronizada y duracion mas cercana (maximo 8 s de diferencia). */
function pickBest(list, durationSec) {
  if (!Array.isArray(list)) return null;
  let best = null, bestDiff = Infinity;
  for (const r of list) {
    if (!r || !(r.syncedLyrics || r.plainLyrics)) continue;
    const diff = durationSec && r.duration ? Math.abs(r.duration - durationSec) : 0;
    const score = diff + (r.syncedLyrics ? 0 : 20);
    if (score < bestDiff) { best = r; bestDiff = score; }
  }
  return best && bestDiff <= 28 ? best : null;
}

async function lookupLyrics({ artist, track, album, durationSec }, fetchImpl = fetch) {
  const q = new URLSearchParams({ artist_name: artist, track_name: track });
  if (album) q.set("album_name", album);
  if (durationSec) q.set("duration", String(Math.round(durationSec)));
  let rec = await getJson(BASE + "/get?" + q, fetchImpl);
  if (!rec || !(rec.syncedLyrics || rec.plainLyrics || rec.instrumental)) {
    const s = await getJson(BASE + "/search?" + new URLSearchParams({ artist_name: artist, track_name: track }), fetchImpl);
    rec = pickBest(s, durationSec);
  }
  if (!rec) return { found: false };
  const synced = rec.syncedLyrics ? parseLrc(rec.syncedLyrics) : [];
  const plain = !synced.length && rec.plainLyrics ? String(rec.plainLyrics).split(/\r?\n/).slice(0, MAX_LINES) : null;
  return { found: true, instrumental: !!rec.instrumental, synced, plain, source: "lrclib" };
}

module.exports = { parseLrc, pickBest, lookupLyrics };
