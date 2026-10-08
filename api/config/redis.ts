import { createClient } from "redis";

export type CachedLink = { id: string; destinationUrl: string };
let client: ReturnType<typeof createClient> | undefined;

export function connectRedis(url: string) {
  client = createClient({
    url,
    socket: { connectTimeout: 1_000 },
    commandOptions: { timeout: 1_000 },
    disableOfflineQueue: true,
  });
  client.on("ready", () => console.log("Redis connected"));
  client.on("error", () => console.warn("Redis unavailable; using MongoDB"));
  // Redis connects in the background so an outage does not prevent API startup.
  void client.connect().catch(() => console.warn("Redis connection failed"));
}

export const redirectCache = {
  async get(shortCode: string): Promise<CachedLink | null> {
    if (!client?.isReady) return null;
    const value = await client.get(`link:${shortCode}`);
    return value ? JSON.parse(value) as CachedLink : null;
  },
  async set(shortCode: string, link: CachedLink) {
    if (!client?.isReady) return;
    await client.set(`link:${shortCode}`, JSON.stringify(link), { EX: 3_600 });
  },
};
