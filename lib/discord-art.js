import { cached, fetchJson } from "./http.js";

const DAY = 24 * 3600 * 1000;

const slug = (name) =>
  String(name || "")
    .normalize("NFKD")
    .replace(/[™®]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const applicationInfo = (applicationId) =>
  cached(`discord:app:${applicationId}`, DAY, () =>
    fetchJson(`https://discord.com/api/v10/applications/${applicationId}/rpc`)
  );

const iconUrl = (applicationId, hash, size) =>
  applicationId && hash ? `https://cdn.discordapp.com/app-icons/${applicationId}/${hash}.png?size=${size}` : null;

function detectableGames() {
  return cached("discord:detectable", 6 * 3600 * 1000, async () => {
    const list = await fetchJson("https://discord.com/api/v10/applications/detectable");
    const byId = new Map();
    const byName = new Map();

    for (const app of Array.isArray(list) ? list : []) {
      const hash = app.icon_hash || app.icon;
      if (!app?.id || !hash) continue;
      const entry = { id: String(app.id), hash };
      byId.set(entry.id, entry);
      for (const name of [app.name, ...(app.aliases || [])]) {
        const key = slug(name);
        if (key && !byName.has(key)) byName.set(key, entry);
      }
    }

    return { byId, byName };
  });
}

export async function lookupAppIcon({ applicationId, name } = {}, size = 128) {
  const id = /^\d{5,25}$/.test(String(applicationId || "")) ? String(applicationId) : null;

  if (id) {
    const own = (await applicationInfo(id).catch(() => null))?.icon;
    if (own) return iconUrl(id, own, size);
  }

  const lists = await detectableGames().catch(() => null);
  if (!lists) return null;

  const hit = (id && lists.byId.get(id)) || lists.byName.get(slug(name));
  return hit ? iconUrl(hit.id, hit.hash, size) : null;
}

export function discordImage(reference, applicationId) {
  if (!reference) return null;
  if (/^https:\/\//i.test(reference)) return reference;
  if (reference.startsWith("mp:external/")) return `https://media.discordapp.net/external/${reference.slice(12)}`;
  if (reference.startsWith("spotify:")) return `https://i.scdn.co/image/${reference.slice(8)}`;
  if (applicationId && /^[\w-]+$/.test(reference)) {
    return `https://cdn.discordapp.com/app-assets/${applicationId}/${reference}.png?size=128`;
  }
  return null;
}
