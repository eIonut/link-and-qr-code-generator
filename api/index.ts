import mongoose from "mongoose";
import dotenv from "dotenv";
import { createApp } from "./app.ts";
import { LinkModel } from "./models/link.ts";
import { readEnvironment } from "./config/environment.ts";
import { connectRedis } from "./config/redis.ts";
import { initializeKafka, kafkaPublisher } from "./config/kafka.ts";

dotenv.config({ path: [".env", "../.env"] });

const { port, shortBaseUrl, mongodbUri, redisUrl, kafkaBrokers } = readEnvironment();
const app = createApp({ shortBaseUrl });

await mongoose.connect(mongodbUri);
// Redirect uniqueness must be enforced before accepting link creations.
await LinkModel.createIndexes();
console.log("Connected to MongoDB and ensured link indexes");
connectRedis(redisUrl);
await initializeKafka(kafkaBrokers);

const server = app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(async () => {
      await kafkaPublisher.disconnect();
      await mongoose.disconnect();
      process.exit(0);
    });
  });
}
