import { cached, fetchJson } from "./http.js";
import { activityGameKey } from "./bot.js";
import { applicationInfo, lookupAppIcon, discordImage } from "./discord-art.js";
import { gameSummary } from "./roblox.js";
import { igdbConfigured, lookupIgdbGame } from "./igdb.js";

const DAY = 24 * 3600 * 1000;

const slug = (name) =>
  String(name || "")
    .normalize("NFKD")
    .replace(/[™®]/g, "")
    .replace(/^Tom Clancy['’]s\s+/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const ENTITIES = { "&amp;": "&", "&quot;": '"', "&apos;": "'", "&lt;": "<", "&gt;": ">", "&nbsp;": " " };

const plainText = (text) =>
  String(text || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:amp|quot|apos|lt|gt|nbsp);/g, (entity) => ENTITIES[entity])
    .replace(/\s+/g, " ")
    .trim();

function safeLink(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? { url: url.href, hostname: url.hostname } : null;
  } catch {
    return null;
  }
}

function steamShape(game, id, icon) {
  if (game?.type !== "game") return null;
  const modeIds = [1, 2, 9, 27, 36, 38, 39];
  const platformNames = { windows: "Windows", mac: "macOS", linux: "Linux" };
  const released = !game.release_date?.coming_soon && Number.isFinite(Date.parse(game.release_date?.date));

  return {
    id,
    name: game.name,
    source: "steam",
    iconUrl: icon || game.header_image,
    coverUrl: game.header_image,
    bannerUrl: game.background_raw || game.background || game.header_image,
    summary: plainText(game.short_description || game.about_the_game),
    screenshots: (game.screenshots || []).slice(0, 6).map((shot) => shot.path_full),
    genres: (game.genres || []).map((genre) => genre.description),
    gameModes: (game.categories || []).filter((item) => modeIds.includes(item.id)).map((item) => item.description),
    platforms: Object.entries(game.platforms || {})
      .filter(([, supported]) => supported)
      .map(([name]) => ({ name: platformNames[name] || name })),
    developers: game.developers || [],
    publishers: game.publishers || [],
    releaseDate: released ? new Date(game.release_date.date).toISOString() : null,
    totalRating: Number.isFinite(game.metacritic?.score) ? game.metacritic.score : null,
    websites: [safeLink(game.website), safeLink(`https://store.steampowered.com/app/${game.steam_appid}/`)].filter(Boolean)
  };
}

async function steamGame(name, app, id, icon) {
  const sku = app?.third_party_skus?.find((entry) => entry.distributor === "steam" && /^\d+$/.test(entry.sku));
  let steamId = sku?.sku;

  if (!steamId) {
    const query = new URLSearchParams({ term: name, l: "english", cc: "us" });
    const search = await fetchJson(`https://store.steampowered.com/api/storesearch/?${query}`);
    steamId = search.items?.find((item) => item.type === "app" && slug(item.name) === slug(name))?.id;
  }

  if (!steamId) return null;

  const result = await fetchJson(`https://store.steampowered.com/api/appdetails?appids=${steamId}&l=english&cc=us`);
  return result[steamId]?.success ? steamShape(result[steamId].data, id, icon) : null;
}

async function robloxExperience(activity, bot, id) {
  const candidates = [
    bot.roblox?.currentGame,
    bot.roblox?.lastPlayed,
    bot.roblox?.lastPlayedGame,
    ...(bot.recentRobloxGames || [])
  ].filter(Boolean);

  const match = candidates.find((game) => slug(game.name) === slug(activity.details));
  if (!match?.universeId) return null;

  const game = await gameSummary(Number(match.universeId));
  if (!game) return null;

  const thumbnails = await fetchJson(
    `https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${game.universeId}&countPerUniverse=6&defaults=true&size=768x432&format=Png&isCircular=false`
  ).catch(() => null);

  const screenshots = (thumbnails?.data?.[0]?.thumbnails || [])
    .filter((image) => image.state === "Completed")
    .map((image) => image.imageUrl);

  return {
    id,
    name: game.name,
    source: "roblox",
    summary: game.description,
    iconUrl: game.iconUrl,
    coverUrl: game.iconUrl,
    bannerUrl: screenshots[0] || game.iconUrl,
    screenshots,
    developers: game.creatorName ? [game.creatorName] : [],
    websites: [safeLink(game.url)].filter(Boolean)
  };
}

async function resolveGame(activity, bot) {
  const id = activityGameKey(activity);
  const applicationId = String(activity.applicationId || activity.application_id || "");

  if (slug(activity.name) === "roblox") {
    const experience = await robloxExperience(activity, bot, id).catch(() => null);
    if (experience) return experience;
  }

  return cached(`game:${id}:${slug(activity.name)}`, DAY, async () => {
    if (igdbConfigured()) {
      const igdb = await lookupIgdbGame(/^\d{5,25}$/.test(applicationId) ? applicationId : id, activity.name).catch(() => null);
      if (igdb) return { ...igdb, id };
    }

    const app = /^\d+$/.test(applicationId) ? await applicationInfo(applicationId).catch(() => null) : null;
    const icon =
      (await lookupAppIcon({ applicationId, name: activity.name }, 256).catch(() => null)) ||
      discordImage(activity.image, applicationId);

    const steam = await steamGame(activity.name, app, id, icon).catch(() => null);
    if (steam) return steam;

    return {
      id,
      name: activity.name,
      source: app?.description ? "discord" : "placeholder",
      summary: plainText(app?.description),
      iconUrl: icon,
      coverUrl: icon,
      websites: []
    };
  });
}

export async function readGameInfo(bot, ids) {
  const known = new Map();

  for (const activity of [...(bot.discord?.activities || []), ...(bot.recentActivities || [])]) {
    const isGame = activity.kind === "playing" || activity.type === 0;
    if (!activity.name || !isGame) continue;
    const id = activityGameKey(activity);
    if (!known.has(id)) known.set(id, activity);
  }

  const games = await Promise.all(
    ids.map((id) => (known.has(id) ? resolveGame(known.get(id), bot).catch(() => null) : null))
  );

  return games.filter(Boolean);
}
