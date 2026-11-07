import { endpoint } from "../lib/http.js";
import { readBot } from "../lib/bot.js";
import { readGameInfo } from "../lib/game-info.js";

export default endpoint(
  async (params) => {
    const ids = [...new Set((params.get("ids") || "").split(",").map((id) => id.trim()).filter(Boolean))];

    if (!ids.length) return [];

    if (ids.length > 25 || ids.some((id) => id.length > 160)) {
      const error = new Error("IDs de juego inválidos");
      error.status = 400;
      throw error;
    }

    return readGameInfo(await readBot(), ids);
  },
  { maxAge: 60, staleWhileRevalidate: 300 }
);
