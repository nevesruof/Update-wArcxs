"use strict";

function createMemoryStore(now = () => Date.now()) {
  const data = new Map();
  const live = (k) => {
    const e = data.get(k);
    if (!e) return undefined;
    if (e.exp && e.exp <= now()) { data.delete(k); return undefined; }
    return e;
  };
  const hashOf = (k) => { let e = live(k); if (!e) { e = { v: new Map() }; data.set(k, e); } return e.v; };
  const setOf = (k) => { let e = live(k); if (!e) { e = { v: new Set() }; data.set(k, e); } return e.v; };
  return {
    kind: "memory",
    async get(k) { const e = live(k); return e ? String(e.v) : null; },
    async set(k, v) { data.set(k, { v: String(v) }); },
    async del(k) { data.delete(k); },
    async incr(k) { const e = live(k); const n = (e ? Number(e.v) : 0) + 1; data.set(k, { v: String(n), exp: e && e.exp }); return n; },
    async hit(k, ttl) {
      const e = live(k); const n = (e ? Number(e.v) : 0) + 1;
      data.set(k, { v: String(n), exp: e ? e.exp : now() + ttl * 1000 });
      return n;
    },
    async claim(k, ttl) { if (live(k)) return false; data.set(k, { v: "1", exp: now() + ttl * 1000 }); return true; },
    async hget(k, f) { const v = hashOf(k).get(f); return v === undefined ? null : v; },
    async hset(k, f, v) { hashOf(k).set(f, String(v)); },
    async hdel(k, f) { hashOf(k).delete(f); },
    async hlen(k) { return hashOf(k).size; },
    async hgetall(k) { return Object.fromEntries(hashOf(k)); },
    async hincrby(k, f, n) { const h = hashOf(k); const v = (Number(h.get(f)) || 0) + n; h.set(f, String(v)); return v; },
    async sadd(k, m) { const s = setOf(k); if (s.has(m)) return 0; s.add(m); return 1; },
    async smembers(k) { return [...setOf(k)]; },
  };
}

function createRedisStore(url, token, fetchImpl = fetch) {
  const base = String(url).replace(/\/+$/, "");
  const headers = { Authorization: "Bearer " + token, "Content-Type": "application/json" };
  async function call(path, payload) {
    const res = await fetchImpl(base + path, { method: "POST", headers, body: JSON.stringify(payload), cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json) throw new Error("redis " + res.status);
    return json;
  }
  async function cmd(...args) {
    const json = await call("", args.map(String));
    if (json.error) throw new Error("redis: " + json.error);
    return json.result;
  }
  const toObject = (flat) => { const o = {}; for (let i = 0; i + 1 < (flat || []).length; i += 2) o[flat[i]] = flat[i + 1]; return o; };
  return {
    kind: "redis",
    get: (k) => cmd("GET", k),
    set: (k, v) => cmd("SET", k, v),
    del: (k) => cmd("DEL", k),
    incr: (k) => cmd("INCR", k),
    async hit(k, ttl) {
      const out = await call("/pipeline", [["INCR", k], ["EXPIRE", k, String(ttl), "NX"]]);
      if (out[0] && out[0].error) throw new Error("redis: " + out[0].error);
      return out[0].result;
    },
    async claim(k, ttl) { return (await cmd("SET", k, "1", "EX", ttl, "NX")) === "OK"; },
    hget: (k, f) => cmd("HGET", k, f),
    hset: (k, f, v) => cmd("HSET", k, f, v),
    hdel: (k, f) => cmd("HDEL", k, f),
    hlen: (k) => cmd("HLEN", k),
    async hgetall(k) { return toObject(await cmd("HGETALL", k)); },
    hincrby: (k, f, n) => cmd("HINCRBY", k, f, n),
    sadd: (k, m) => cmd("SADD", k, m),
    async smembers(k) { return (await cmd("SMEMBERS", k)) || []; },
  };
}

let cached = null;
function getStore(env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  const kind = url && token ? "redis" : "memory";
  if (!cached || cached.kind !== kind) cached = kind === "redis" ? createRedisStore(url, token) : createMemoryStore();
  return cached;
}
function _setStore(s) { cached = s; }

module.exports = { getStore, createMemoryStore, createRedisStore, _setStore };
