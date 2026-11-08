const memory = new Map();
const inflight = new Map();

export const LIVE_CACHE = "public, s-maxage=5, stale-while-revalidate=15";

export async function cached(key, ttl, load) {
  const saved = memory.get(key);
  if (saved && saved.expires > Date.now()) return saved.value;
  if (inflight.has(key)) return inflight.get(key);

  const task = Promise.resolve()
    .then(load)
    .then((value) => {
      if (memory.size >= 200) memory.delete(memory.keys().next().value);
      memory.set(key, { value, expires: Date.now() + (typeof ttl === "function" ? ttl(value) : ttl) });
      return value;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, task);
  return task;
}

export async function fetchJson(url, options = {}) {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000), ...options });
  if (!response.ok) {
    const error = new Error(`El servicio respondió ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

const hits = new Map();

export function rateLimit(req, scope, limit, windowMs = 60000) {
  const header = req?.headers?.["x-real-ip"] || req?.headers?.["x-forwarded-for"] || req?.socket?.remoteAddress;
  const ip = String(header || "unknown").split(",")[0].trim();
  const now = Date.now();
  const key = `${scope}:${ip}`;
  const entry = hits.get(key);

  if (!entry || entry.reset <= now) {
    if (hits.size >= 5000) {
      for (const [saved, value] of hits) if (value.reset <= now) hits.delete(saved);
      if (hits.size >= 5000) hits.clear();
    }
    hits.set(key, { count: 1, reset: now + windowMs });
    return;
  }

  if (++entry.count > limit) {
    const error = new Error("Demasiadas solicitudes");
    error.status = 429;
    error.expose = true;
    error.retryAfter = Math.max(1, Math.ceil((entry.reset - now) / 1000));
    throw error;
  }
}

export function requiredText(params, key) {
  const text = params.get(key)?.trim();
  if (!text || text.length > 240) {
    const error = new Error(`Valor inválido: ${key}`);
    error.status = 400;
    throw error;
  }
  return text;
}

export function endpoint(load, { maxAge = 0, staleWhileRevalidate = 0 } = {}) {
  const cacheControl = maxAge
    ? `public, s-maxage=${maxAge}${staleWhileRevalidate ? `, stale-while-revalidate=${staleWhileRevalidate}` : ""}`
    : "no-store";

  return async (req, res) => {
    res.setHeader("Cache-Control", cacheControl);

    if (req.method && req.method !== "GET") {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Solo GET" });
    }

    try {
      const params = new URL(req.url, "http://localhost").searchParams;
      return res.status(200).json(await load(params, req, res));
    } catch (error) {
      res.setHeader("Cache-Control", "no-store");
      if (error.retryAfter) res.setHeader("Retry-After", String(error.retryAfter));
      const status = error.expose || error.status === 400 ? error.status : 503;
      return res.status(status).json({ error: status === 503 ? "Servicio no disponible por ahora" : error.message });
    }
  };
}
