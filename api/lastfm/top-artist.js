"use strict";
// GET /api/lastfm/top-artist -> { artist, image } artista mas escuchado en los ultimos 30 dias ({} si no hay datos).
const { lastfm, toTracks, toTopArtist, route } = require("../_lib/lastfm");

module.exports = route(
  async () => {
    const top = await lastfm("user.gettopartists", { period: "1month", limit: "1" });
    // La imagen del artista en Last.fm es un placeholder; usamos la portada de una cancion reciente suya.
    const recent = await lastfm("user.getrecenttracks", { limit: "50" }).then((r) => toTracks(r, 50)).catch(() => null);
    return toTopArtist(top, recent);
  },
  { cache: "public, s-maxage=300, stale-while-revalidate=600" }
);
