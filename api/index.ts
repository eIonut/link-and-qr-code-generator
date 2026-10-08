import mongoose from "mongoose";
import dotenv from "dotenv";
import { createApp } from "./app.ts";
import { LinkModel } from "./link-model.ts";

dotenv.config();

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}
const app = createApp({
  shortBaseUrl: process.env.SHORT_BASE_URL ?? `http://localhost:${port}/r`,
});

await mongoose.connect(
  process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/qr_code_generator",
);
// Redirect uniqueness must be enforced before accepting link creations.
await LinkModel.createIndexes();
console.log("Connected to MongoDB and ensured link indexes");

const server = app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(() => {
      void mongoose.disconnect().then(() => process.exit(0));
    });
  });
}
