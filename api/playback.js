import { cached, endpoint, rateLimit, requiredText } from "../lib/http.js";
import { findVideos } from "../lib/youtube.js";

const FOUND = "public, s-maxage=86400, stale-while-revalidate=604800";
const MISSED = "public, s-maxage=30";

export default endpoint(async (params, req, res) => {
  const track = requiredText(params, "track");
  const artist = requiredText(params, "artist");
  const key = `youtube:${track.toLowerCase()}:${artist.toLowerCase()}`;

  const result = await cached(
    key,
    (value) => (value.available ? 24 * 3600 * 1000 : 60 * 1000),
    () => {
      rateLimit(req, "playback", 30);
      return findVideos({ track, artist });
    }
  );

  res?.setHeader("Cache-Control", result.available ? FOUND : MISSED);
  return result;
});
