import { cached, endpoint, fetchJson, rateLimit } from "../lib/http.js";

const NAME = /^[A-Za-z0-9_]{3,16}$/;

function texture(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "textures.minecraft.net") return null;
    parsed.protocol = "https:";
    return parsed.toString();
  } catch {
    return null;
  }
}

async function findProfile(name) {
  const sources = [
    `https://api.minecraftservices.com/minecraft/profile/lookup/name/${name}`,
    `https://api.mojang.com/users/profiles/minecraft/${name}`
  ];

  for (const url of sources) {
    try {
      const body = await fetchJson(url, { signal: AbortSignal.timeout(5000) });
      if (body && typeof body.id === "string" && /^[0-9a-f]{32}$/i.test(body.id)) return { id: body.id, name: String(body.name || name) };
    } catch {
      continue;
    }
  }

  return null;
}

async function readTextures(id) {
  const body = await fetchJson(`https://sessionserver.mojang.com/session/minecraft/profile/${id}`, { signal: AbortSignal.timeout(5000) });
  const property = Array.isArray(body.properties) ? body.properties.find((item) => item.name === "textures") : null;
  if (!property) return {};

  const parsed = JSON.parse(Buffer.from(property.value, "base64").toString("utf8"));
  const skin = parsed?.textures?.SKIN;
  const cape = parsed?.textures?.CAPE;
  return {
    skin: skin ? texture(skin.url) : null,
    slim: skin?.metadata?.model === "slim",
    cape: cape ? texture(cape.url) : null
  };
}

async function optifineCape(name) {
  const url = `https://s.optifine.net/capes/${encodeURIComponent(name)}.png`;
  try {
    const response = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(4000), cache: "no-store" });
    return response.ok && /image\/png/i.test(response.headers.get("content-type") || "") ? url : null;
  } catch {
    return null;
  }
}

export default endpoint(
  async (params, req) => {
    const name = (params.get("name") || "").trim();
    if (!NAME.test(name)) {
      const error = new Error("Usuario inválido");
      error.status = 400;
      throw error;
    }

    return cached(`minecraft:${name.toLowerCase()}`, 10 * 60 * 1000, async () => {
      rateLimit(req, "minecraft", 20);
      const profile = await findProfile(name);
      if (!profile) return { found: false, name, skin: null, slim: false, cape: null, capeFrom: null };

      let found = {};
      try {
        found = await readTextures(profile.id);
      } catch {
        found = {};
      }

      let cape = found.cape || null;
      let capeFrom = cape ? "mojang" : null;
      if (!cape) {
        cape = await optifineCape(profile.name);
        capeFrom = cape ? "optifine" : null;
      }

      return { found: true, name: profile.name, skin: found.skin || null, slim: Boolean(found.slim), cape, capeFrom };
    });
  },
  { maxAge: 600, staleWhileRevalidate: 3600 }
);
