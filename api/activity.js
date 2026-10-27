"use strict";
const { route, toPresence, offlinePresence } = require("./_lib/bot");
const { withLastActive } = require("./_lib/lastactive");

module.exports = route((raw) => withLastActive(toPresence(raw)), {
  cache: "public, s-maxage=2, stale-while-revalidate=10",
  onError: () => withLastActive(offlinePresence(null)),
});
