import { cached, fetchJson } from "./http.js";

export async function gameSummary(universeId) {
  if (!Number.isSafeInteger(universeId) || universeId <= 0) return null;

  return cached(`roblox:game:${universeId}`, 5 * 60 * 1000, async () => {
    const [games, icons] = await Promise.all([
      fetchJson(`https://games.roblox.com/v1/games?universeIds=${universeId}`),
      fetchJson(
        `https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&size=150x150&format=Png&isCircular=false`
      ).catch(() => null)
    ]);

    const game = games.data?.[0];
    if (!game) return null;

    return {
      universeId,
      placeId: game.rootPlaceId,
      name: game.name,
      creatorName: game.creator?.name || null,
      description: game.description,
      url: `https://www.roblox.com/games/${game.rootPlaceId}`,
      iconUrl: icons?.data?.find((item) => item.state === "Completed")?.imageUrl || null
    };
  });
}
