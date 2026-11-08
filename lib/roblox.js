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

const JSON_HEADERS = { "Content-Type": "application/json" };

async function modelFor(userId) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const meta = await fetchJson(`https://thumbnails.roblox.com/v1/users/avatar-3d?userId=${userId}`);
    if (meta.state === "Completed" && meta.imageUrl) {
      const model = await fetchJson(meta.imageUrl);
      return {
        obj: model.obj,
        mtl: model.mtl,
        textures: model.textures || [],
        camera: model.camera || null,
        aabb: model.aabb || null
      };
    }
    await new Promise((done) => setTimeout(done, 1000));
  }
  return null;
}

async function collectiblesValue(userId) {
  let cursor = "";
  let sum = 0;

  for (let page = 0; page < 6; page += 1) {
    const url = `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?limit=100&sortOrder=Asc${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const body = await fetchJson(url);
    if (!Array.isArray(body.data)) return null;
    sum += body.data.reduce((total, item) => total + (item.recentAveragePrice || 0), 0);
    if (!body.nextPageCursor) break;
    cursor = body.nextPageCursor;
  }

  return sum;
}

export async function readProfile(username) {
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username || "")) return null;

  return cached(`roblox:profile:${username}`, 10 * 60 * 1000, async () => {
    const lookup = await fetchJson("https://users.roblox.com/v1/usernames/users", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: false })
    });
    const user = lookup.data?.[0];
    if (!user) return null;

    const count = (kind) =>
      fetchJson(`https://friends.roblox.com/v1/users/${user.id}/${kind}/count`)
        .then((body) => body.count)
        .catch(() => null);

    const [friends, following, followers, rap, avatar, model] = await Promise.all([
      count("friends"),
      count("followings"),
      count("followers"),
      collectiblesValue(user.id).catch(() => null),
      fetchJson(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${user.id}&size=420x420&format=Png&isCircular=false`)
        .then((body) => body.data?.[0]?.imageUrl || "")
        .catch(() => ""),
      modelFor(user.id).catch(() => null)
    ]);

    return {
      userId: user.id,
      username: user.name,
      displayName: user.displayName,
      profileUrl: `https://www.roblox.com/users/${user.id}/profile`,
      friends,
      following,
      followers,
      rap,
      avatarUrl: avatar,
      model,
      fetchedAt: Date.now()
    };
  });
}
