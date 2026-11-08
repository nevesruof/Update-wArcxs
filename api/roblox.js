import { endpoint } from "../lib/http.js";
import { gameSummary, readProfile } from "../lib/roblox.js";

export default endpoint(
  async (params) => {
    if (params.has("universeId")) return gameSummary(Number(params.get("universeId")));
    const profile = await readProfile(process.env.ROBLOX_USERNAME || "zahidtql12");
    if (!profile) throw Object.assign(new Error("Roblox user unavailable"), { status: 404 });
    return profile;
  },
  { maxAge: 300, staleWhileRevalidate: 600 }
);
