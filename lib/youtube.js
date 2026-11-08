const ID = /^[\w-]{11}$/;

export function apiFailureReason(status, body) {
  const reasons = (body?.error?.errors || []).map((entry) => entry.reason);
  const message = String(body?.error?.message || "");

  if (reasons.some((r) => ["quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded"].includes(r)) || /quota/i.test(message))
    return "youtube-quota-exceeded";

  if (
    reasons.some((r) => ["keyInvalid", "accessNotConfigured", "forbidden", "ipRefererBlocked"].includes(r)) ||
    [400, 401, 403].includes(status)
  )
    return "youtube-key-rejected";

  return "youtube-error";
}

async function apiSearch(query, apiKey, fetchImpl) {
  const params = new URLSearchParams({
    key: apiKey,
    part: "snippet",
    type: "video",
    videoEmbeddable: "true",
    videoSyndicated: "true",
    maxResults: "5",
    q: query
  });

  let response;
  try {
    response = await fetchImpl(`https://www.googleapis.com/youtube/v3/search?${params}`, { signal: AbortSignal.timeout(8000) });
  } catch (error) {
    return { videoIds: [], reason: "youtube-unreachable" };
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) return { videoIds: [], reason: apiFailureReason(response.status, body) };

  const videoIds = (Array.isArray(body?.items) ? body.items : []).map((item) => item.id?.videoId).filter((id) => ID.test(id || ""));
  return { videoIds, source: "youtube-api" };
}

export function parseSearchPage(html) {
  const ids = [];
  for (const match of String(html).matchAll(/"videoRenderer":\{"videoId":"([\w-]{11})"/g)) {
    if (!ids.includes(match[1])) ids.push(match[1]);
  }
  return ids.slice(0, 5);
}

async function scrapeSearch(query, fetchImpl) {
  try {
    const response = await fetchImpl(`https://www.youtube.com/results?${new URLSearchParams({ search_query: query, sp: "EgIQAQ==" })}`, {
      headers: {
        "Accept-Language": "en-US,en;q=0.9",
        Cookie: "CONSENT=YES+1; SOCS=CAI",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
      },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return { videoIds: [], reason: "youtube-scrape-failed" };
    const videoIds = parseSearchPage(await response.text());
    return videoIds.length ? { videoIds, source: "youtube-scrape" } : { videoIds: [], reason: "youtube-scrape-empty" };
  } catch (error) {
    return { videoIds: [], reason: "youtube-scrape-failed" };
  }
}

export async function findVideos(
  { track, artist },
  { apiKey = process.env.YOUTUBE_API_KEY?.trim(), scrape = process.env.YOUTUBE_SCRAPE_FALLBACK, fetchImpl = fetch } = {}
) {
  const query = `${artist} ${track} official audio`;
  let outcome = apiKey ? await apiSearch(query, apiKey, fetchImpl) : { videoIds: [], reason: "youtube-not-configured" };

  const failed = !outcome.videoIds.length && outcome.reason;
  if (failed && String(scrape || "").toLowerCase() !== "off") {
    const fallback = await scrapeSearch(query, fetchImpl);
    if (fallback.videoIds.length) outcome = { ...fallback, apiReason: outcome.reason };
  }

  const { videoIds } = outcome;
  return {
    videoIds,
    videoId: videoIds[0] || null,
    available: videoIds.length > 0,
    source: outcome.source,
    reason: videoIds.length ? undefined : outcome.reason || "no-results",
    apiReason: outcome.apiReason
  };
}
