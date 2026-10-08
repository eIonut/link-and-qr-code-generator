import mongoose from "mongoose";
import dotenv from "dotenv";
import { createApp } from "./app.ts";
import { LinkModel } from "./models/link.ts";
import { readEnvironment } from "./config/environment.ts";
import { connectRedis } from "./config/redis.ts";

dotenv.config();

const { port, shortBaseUrl, mongodbUri, redisUrl } = readEnvironment();
const app = createApp({ shortBaseUrl });

await mongoose.connect(mongodbUri);
// Redirect uniqueness must be enforced before accepting link creations.
await LinkModel.createIndexes();
console.log("Connected to MongoDB and ensured link indexes");
connectRedis(redisUrl);

app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
});
