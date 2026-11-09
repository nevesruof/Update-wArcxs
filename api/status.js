import { cached, endpoint } from "../lib/http.js";
import { readBot } from "../lib/bot.js";

const STATS_USER = process.env.STATSFM_USER?.trim() || "31esju7gpv3nvyqglogd3mqyczd4";

async function reach(url, options = {}) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "no-store", ...options });
  if (!response.ok) throw new Error(String(response.status));
  await response.arrayBuffer();
}

async function measure(id, name, probe) {
  const started = Date.now();
  try {
    await probe();
    return { id, name, ok: true, ms: Date.now() - started };
  } catch (error) {
    return { id, name, ok: false, ms: Date.now() - started };
  }
}

function checks() {
  const list = [
    measure("bot", "discord bot", () => readBot()),
    measure("stats", "stats.fm", () => reach(`https://api.stats.fm/api/v1/users/${STATS_USER}`)),
    measure("roblox", "roblox", () => reach("https://users.roblox.com/v1/users/1")),
    measure("lyrics", "lyrics", () => reach("https://lrclib.net/api/search?q=love")),
  ];

  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (key) {
    list.push(
      measure("youtube", "youtube audio", () =>
        reach(`https://www.googleapis.com/youtube/v3/videos?${new URLSearchParams({ part: "id", id: "dQw4w9WgXcQ", key })}`)
      )
    );
  }

  return Promise.all(list);
}

export default endpoint(
  async () => {
    const items = await cached("status", 30000, async () => ({ checked: Date.now(), items: await checks() }));
    return items;
  },
  { maxAge: 30, staleWhileRevalidate: 60 }
);
