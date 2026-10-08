export function readEnvironment() {
  const port = Number(process.env.PORT ?? 3000);
  return {
    port,
    mongodbUri: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/qr_code_generator",
    redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
    shortBaseUrl: process.env.SHORT_BASE_URL ?? `http://localhost:${port}/r`,
  };
}
