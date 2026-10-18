"use strict";
// GET /api/lastfm/top-artist -> { artist, image } del historial reciente del bot ({} si no hay canciones).
const { route, toTopArtist } = require("../_lib/bot");

module.exports = route((raw) => toTopArtist(raw), {
  cache: "public, s-maxage=300, stale-while-revalidate=600",
});
