import { endpoint, cached } from "../lib/http.js";

const SITES = ["https://larpingclient.vercel.app", "https://fmsociety.me"];

async function probe(url) {
  const started = Date.now();
  const attempt = (method) => fetch(url, { method, redirect: "follow", signal: AbortSignal.timeout(5000), headers: { "User-Agent": "profile-status-check" } });

  try {
    let response = await attempt("HEAD");
    if (response.status === 405 || response.status === 501) response = await attempt("GET");
    return { host: new URL(url).hostname, up: response.status < 500, ms: Date.now() - started };
  } catch {
    return { host: new URL(url).hostname, up: false, ms: null };
  }
}

export default endpoint(
  async () => ({ sites: await cached("status:sites", 60000, () => Promise.all(SITES.map(probe))) }),
  { maxAge: 60, staleWhileRevalidate: 120 }
);
