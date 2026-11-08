import { cached } from "./http.js";

export const USER_ID = process.env.DISCORD_USER_ID?.trim() || "893966003690668102";
const DEFAULT_BOT_URL = "http://fi10.bot-hosting.cloud:25169/api/activity";

const TYPE_BY_KIND = { playing: 0, streaming: 1, listening: 2, watching: 3, custom: 4, competing: 5, spotify: 2 };

export const activityType = (item) =>
  Number.isInteger(item.type) ? item.type : (TYPE_BY_KIND[String(item.kind).toLowerCase()] ?? 0);

export function activityGameKey(activity) {
  const id = String(activity.applicationId || activity.application_id || `name:${activity.name}`);
  const experience = String(activity.details || "").trim().toLowerCase();
  return String(activity.name).toLowerCase() === "roblox" && experience ? `${id}:${experience}` : id;
}

const toMs = (seconds) => (Number.isFinite(Number(seconds)) && Number(seconds) > 0 ? Number(seconds) * 1000 : null);

function httpsOnly(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export function readBot() {
  const url = process.env.ACTIVITY_BOT_URL?.trim() || DEFAULT_BOT_URL;
  return cached(`bot:${url}`, 4000, () => loadBot(url));
}

async function loadBot(url) {
  const token = process.env.ACTIVITY_BOT_TOKEN?.trim();
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
    signal: AbortSignal.timeout(8000)
  });

  if (!response.ok) throw new Error(`El bot respondió ${response.status}`);

  const bot = await response.json();
  const valid =
    String(bot.discordUserId) === USER_ID &&
    Array.isArray(bot.discord?.activities) &&
    Array.isArray(bot.recentActivities);

  if (!valid) throw new Error("Respuesta inesperada del bot");
  return bot;
}

export function lastOnlineAt(bot) {
  let latest = 0;
  for (const status of Array.isArray(bot.recentStatuses) ? bot.recentStatuses : []) {
    if (!["online", "idle", "dnd"].includes(status?.name)) continue;
    latest = Math.max(latest, toMs(status.lastSeen) || 0);
  }
  return latest || null;
}

function discordUser(bot) {
  const profile = bot.profile;
  if (!profile) return { id: USER_ID };
  return {
    id: profile.id || USER_ID,
    username: profile.username,
    global_name: profile.global_name,
    avatar: profile.avatar,
    banner: profile.banner,
    discriminator: profile.discriminator,
    display_name: profile.display_name || profile.global_name,
    display_name_styles: profile.display_name_styles,
    avatar_decoration_data: profile.avatar_decoration_data,
    clan: profile.clan
  };
}

export function presencePayload(bot) {
  const live = bot.discord;
  const fresh = live.connected !== false && Date.now() - (toMs(live.updatedAt) || 0) < 120000;
  const known = ["online", "idle", "dnd", "offline"].includes(live.status);
  const status = fresh && known ? live.status : "unknown";
  const items = fresh && status !== "offline" ? live.activities : [];
  const spotify = items.find((item) => item.kind === "spotify");
  const active = (device) => fresh && live[device] != null && live[device] !== "offline";

  return {
    success: true,
    data: {
      discord_user: discordUser(bot),
      discord_status: status,
      last_online_at: status === "offline" ? lastOnlineAt(bot) : null,
      active_on_discord_web: active("webStatus"),
      active_on_discord_desktop: active("desktopStatus"),
      active_on_discord_mobile: active("mobileStatus"),
      activities: items.map((item) => ({
        id: item.key || item.applicationId || item.trackId || item.name,
        name: item.kind === "spotify" ? "Spotify" : item.name,
        type: activityType(item),
        application_id: item.applicationId ? String(item.applicationId) : undefined,
        details: item.kind === "spotify" ? item.name : item.details,
        state: item.kind === "spotify" ? item.artist : item.state,
        emoji: item.kind === "custom" && item.emoji ? { name: item.emoji } : undefined,
        assets: item.image ? { large_image: item.image, large_text: item.album || item.largeText } : undefined,
        timestamps: item.startMs ? { start: item.startMs, ...(item.endMs ? { end: item.endMs } : {}) } : undefined,
        sync_id: item.trackId
      })),
      listening_to_spotify: Boolean(spotify),
      spotify: spotify
        ? {
            track_id: spotify.trackId,
            song: spotify.name,
            artist: spotify.artist,
            album: spotify.album,
            album_art_url: spotify.image,
            timestamps: { start: spotify.startMs, end: spotify.endMs }
          }
        : null
    }
  };
}

export function historyPayload(bot) {
  const games = bot.recentActivities
    .filter((item) => item.name && item.kind !== "spotify" && activityType(item) !== 4)
    .map((item) => ({
      id: `discord:${item.sessionId ?? `${item.name}:${item.firstSeen}`}`,
      key: activityGameKey(item),
      name: item.name,
      type: activityType(item),
      applicationId: item.applicationId ? String(item.applicationId) : undefined,
      details: item.details,
      state: item.state,
      image: item.image,
      startedAt: item.startMs || toMs(item.firstSeen),
      lastSeenAt: toMs(item.lastSeen),
      active: Boolean(item.active)
    }))
    .filter((item) => item.lastSeenAt)
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt);

  const songs = (bot.recentSongs || bot.recentActivities.filter((item) => item.kind === "spotify"))
    .map((item) => ({
      id: `song:${item.sessionId}`,
      track: item.name,
      artist: item.artist || "",
      album: item.album || "",
      cover: item.image || null,
      listenedAt: toMs(item.lastSeen),
      url: httpsOnly(item.url)
    }))
    .filter((item) => item.track && item.listenedAt)
    .sort((a, b) => b.listenedAt - a.listenedAt)
    .slice(0, 20);

  return {
    userId: USER_ID,
    games,
    songs,
    roblox: bot.roblox,
    recentRobloxGames: bot.recentRobloxGames || [],
    generatedAt: bot.generatedAt
  };
}
