"use strict";
const { getStore } = require("./store");

const KEY = "take:discord:last-active";
const WRITE_EVERY_MS = 60 * 1000;

let lastWrite = -Infinity;
function _reset() { lastWrite = -Infinity; }

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
  }
  return out;
}

module.exports = { withLastActive, KEY, _reset };
