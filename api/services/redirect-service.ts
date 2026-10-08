import { redirectCache } from "../config/redis.ts";
import { getLinkByShortCode } from "./link-service.ts";

export async function resolveRedirect(shortCode: string) {
  try {
    const cached = await redirectCache.get(shortCode);
    if (cached) {
      console.log("cache hit", { shortCode });
      return cached;
    }
  } catch {
    console.warn("Redis read failed; using MongoDB");
  }

  console.log("cache miss", { shortCode });
  const link = await getLinkByShortCode(shortCode);
  if (!link) return null;

  const redirect = { id: link._id, destinationUrl: link.destinationUrl };
  try {
    await redirectCache.set(shortCode, redirect);
  } catch {
    console.warn("Redis write failed; continuing redirect");
  }
  return redirect;
}
