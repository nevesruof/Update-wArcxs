import { cached, fetchJson } from "./http.js";
import { applicationInfo, lookupAppIcon } from "./discord-art.js";

const WEBSITE_KIND = {
  1: "official",
  3: "wikipedia",
  4: "twitter",
  5: "facebook",
  6: "twitch",
  8: "instagram",
  9: "youtube",
  13: "steam",
  14: "reddit",
  15: "itch",
  16: "epicgames",
  17: "gog",
  18: "discord"
};

const picture = (imageId, size) =>
  imageId ? `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.jpg` : null;

const names = (list) => (list || []).map((item) => item.name).filter(Boolean);

export const igdbConfigured = () => Boolean(process.env.IGDB_CLIENT_ID && process.env.IGDB_CLIENT_SECRET);

function twitchToken() {
  return cached("twitch:token", 50 * 24 * 3600 * 1000, async () => {
    const clientId = process.env.IGDB_CLIENT_ID?.trim();
    const clientSecret = process.env.IGDB_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) throw new Error("Faltan las credenciales de Twitch");

    const query = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials"
    });
    const data = await fetchJson(`https://id.twitch.tv/oauth2/token?${query}`, { method: "POST" });
    return { token: data.access_token, clientId };
  });
}

async function searchGame(name) {
  const { token, clientId } = await twitchToken();
  const escaped = name.replace(/[\\"]/g, "\\$&");

  const body = `search "${escaped}";
    fields name,slug,summary,storyline,first_release_date,rating,aggregated_rating,total_rating,
      genres.name,themes.name,game_modes.name,player_perspectives.name,
      platforms.name,platforms.abbreviation,
      involved_companies.company.name,involved_companies.developer,involved_companies.publisher,
      websites.url,websites.category,screenshots.image_id,cover.image_id;
    limit 1;`;

  const [game] = await fetchJson("https://api.igdb.com/v4/games", {
    method: "POST",
    headers: { "Client-ID": clientId, Authorization: `Bearer ${token}`, "Content-Type": "text/plain" },
    body
  });

  return game || null;
}

function shapeGame(id, game, iconUrl) {
  const developers = [];
  const publishers = [];

  for (const link of game.involved_companies || []) {
    const company = link.company?.name;
    if (!company) continue;
    if (link.developer) developers.push(company);
    if (link.publisher) publishers.push(company);
  }

  return {
    id: String(id),
    igdbId: game.id,
    name: game.name,
    source: "igdb",
    iconUrl,
    coverUrl: picture(game.cover?.image_id, "cover_big"),
    bannerUrl: picture(game.screenshots?.[0]?.image_id, "1080p"),
    summary: game.summary || game.storyline || null,
    genres: names(game.genres),
    themes: names(game.themes),
    gameModes: names(game.game_modes),
    playerPerspectives: names(game.player_perspectives),
    platforms: (game.platforms || [])
      .map((platform) => ({ name: platform.name, abbreviation: platform.abbreviation || null }))
      .filter((platform) => platform.name),
    developers,
    publishers,
    websites: (game.websites || [])
      .map((site) => ({ url: site.url, hostname: WEBSITE_KIND[site.category] || null }))
      .filter((site) => site.hostname),
    screenshots: (game.screenshots || []).map((shot) => picture(shot.image_id, "1080p")).filter(Boolean),
    releaseDate: game.first_release_date ? new Date(game.first_release_date * 1000).toISOString().slice(0, 10) : null,
    totalRating: typeof game.total_rating === "number" ? game.total_rating : null
  };
}

export function lookupIgdbGame(applicationId, fallbackName) {
  return cached(`igdb:${applicationId}`, 6 * 3600 * 1000, async () => {
    let name = fallbackName;

    if (/^\d{5,25}$/.test(String(applicationId))) {
      const app = await applicationInfo(applicationId).catch(() => null);
      if (typeof app?.name === "string" && app.name.trim()) name = app.name.trim();
    }

    if (!name) return null;

    const game = await searchGame(name);
    if (!game) return null;

    const icon = await lookupAppIcon({ applicationId, name }, 256).catch(() => null);
    return shapeGame(applicationId, game, icon);
  });
}
