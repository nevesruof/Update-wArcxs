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
      memory.set(key, { value, expires: Date.now() + ttl });
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
      return res.status(200).json(await load(params, req));
    } catch (error) {
      res.setHeader("Cache-Control", "no-store");
      const status = error.status === 400 ? 400 : 503;
      return res.status(status).json({ error: status === 400 ? error.message : "Servicio no disponible por ahora" });
    }
  };
}
