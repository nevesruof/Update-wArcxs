"use strict";
// GET /api/activity -> presencia de Discord (online/idle/dnd/offline, avatar, Spotify, actividades).
// Reemplaza a Lanyard: la fuente es el bot propio (bot/main.py).
// Extra: `now` (hora del servidor) y `last_active` (solo offline) para el "last active" y para sincronizar la cancion.
const { route, toPresence, offlinePresence } = require("./_lib/bot");
const { withLastActive } = require("./_lib/lastactive");

module.exports = route((raw) => withLastActive(toPresence(raw)), {
  // s-maxage corto: la web calcula el segundo de la cancion con `now` + el header Age, asi que el error maximo es ~2 s.
  cache: "public, s-maxage=2, stale-while-revalidate=10",
  // Si el bot no responde no sabemos el estado: se muestra offline en vez de dejar el ultimo estado congelado.
  onError: () => withLastActive(offlinePresence(null)),
});
