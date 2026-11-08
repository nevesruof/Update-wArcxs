import { endpoint } from "../lib/http.js";
import { readBot } from "../lib/bot.js";
import { lastPlayedGame } from "../lib/roblox.js";

export default endpoint(
  async () => {
    const game = await lastPlayedGame(await readBot());
    if (!game) throw Object.assign(new Error("Sin partidas de Roblox registradas"), { status: 404 });
    return game;
  },
  { maxAge: 20, staleWhileRevalidate: 60 }
);
