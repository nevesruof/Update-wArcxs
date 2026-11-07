import { endpoint } from "../lib/http.js";
import { readBot, historyPayload } from "../lib/bot.js";
import { lookupAppIcon, discordImage } from "../lib/discord-art.js";

async function withArtwork(game) {
  const image = discordImage(game.image, game.applicationId);
  if (image) return { ...game, image };

  const icon = await lookupAppIcon({ applicationId: game.applicationId, name: game.name }).catch(() => null);
  return icon ? { ...game, image: icon } : game;
}

export default endpoint(
  async () => {
    const payload = historyPayload(await readBot());
    const head = await Promise.all(payload.games.slice(0, 20).map(withArtwork));
    return { ...payload, games: [...head, ...payload.games.slice(20)] };
  },
  { maxAge: 5, staleWhileRevalidate: 15 }
);
