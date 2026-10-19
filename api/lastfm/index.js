"use strict";
// GET /api/lastfm?limit=20 -> { tracks: [...] } desde Last.fm (user.getRecentTracks). El primero trae nowPlaying:true si estas escuchando algo.
const { lastfm, toTracks, route } = require("../_lib/lastfm");

module.exports = route(
  async (req) => {
    const limit = Math.max(1, Math.min(parseInt(req.query && req.query.limit, 10) || 20, 50));
    return toTracks(await lastfm("user.getrecenttracks", { limit: String(limit) }), limit);
  },
  // Corto para que "now playing" no se quede viejo.
  { cache: "public, s-maxage=15, stale-while-revalidate=30" }
);
