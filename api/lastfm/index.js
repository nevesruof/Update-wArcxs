"use strict";
// GET /api/lastfm?limit=20 -> { tracks: [...] } con el historial de Spotify que registra el bot.
const { route, toTracks } = require("../_lib/bot");

module.exports = route((raw, req) => toTracks(raw, req.query && req.query.limit), {
  cache: "public, s-maxage=30, stale-while-revalidate=60",
});
