"use strict";
// GET /api/activity -> presencia de Discord (online/idle/dnd/offline, avatar, Spotify, actividades).
// Reemplaza a Lanyard: la fuente es el bot propio (bot/main.py).
const { route, toPresence, offlinePresence } = require("./_lib/bot");

module.exports = route((raw) => toPresence(raw), {
  cache: "public, s-maxage=5, stale-while-revalidate=15",
  // Si el bot no responde no sabemos el estado: se muestra offline en vez de dejar el ultimo estado congelado.
  onError: () => offlinePresence(null),
});
