"use strict";
/*
 * "Last active" de Discord: cuando el bot dice offline, la web quiere mostrar hace cuanto estuviste activo.
 * Guardamos en el store (Upstash Redis en Vercel) la ultima vez que vimos un estado distinto de offline.
 * Sin Redis funciona en memoria, que en Vercel se pierde entre invocaciones (ver README).
 */
const { getStore } = require("./store");

const KEY = "take:discord:last-active";
const WRITE_EVERY_MS = 60 * 1000; // no escribir en cada consulta: una vez por minuto basta

let lastWrite = -Infinity;
function _reset() { lastWrite = -Infinity; }

/**
 * Agrega a la presencia `now` (hora del servidor, para sincronizar el segundo de la cancion en el navegador)
 * y `last_active` (ms epoch, solo cuando esta offline; null si nunca lo hemos visto activo).
 */
async function withLastActive(presence, { store = getStore(), now = Date.now } = {}) {
  const t = now();
  const out = { ...presence, now: t, last_active: null };
  try {
    if (presence.discord_status !== "offline") {
      if (t - lastWrite >= WRITE_EVERY_MS) {
        lastWrite = t;
        await store.set(KEY, t);
      }
    } else {
      const v = Number(await store.get(KEY));
      out.last_active = v > 0 ? v : null;
    }
  } catch (e) {
    // el store es opcional: sin el solo se pierde el "last active"
  }
  return out;
}

module.exports = { withLastActive, KEY, _reset };
