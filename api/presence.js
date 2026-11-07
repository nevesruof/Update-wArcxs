import { endpoint } from "../lib/http.js";
import { readBot, presencePayload } from "../lib/bot.js";

export default endpoint(async () => presencePayload(await readBot()), {
  maxAge: 5,
  staleWhileRevalidate: 15
});
