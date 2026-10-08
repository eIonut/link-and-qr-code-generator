import dotenv from "dotenv";
import mongoose from "mongoose";
import { readEnvironment } from "../config/environment.ts";
import { initializeKafka, kafkaPublisher } from "../config/kafka.ts";
import { getLinkById } from "../services/link-service.ts";
import { publishLinkCreated } from "../services/link-event-service.ts";

dotenv.config();
const id = process.argv[2];
if (!id) throw new Error("Usage: pnpm kafka:republish LINK_ID");
const { mongodbUri, kafkaBrokers } = readEnvironment();

await mongoose.connect(mongodbUri);
try {
  const link = await getLinkById(id);
  if (!link) throw new Error(`Link ${id} not found.`);
  await initializeKafka(kafkaBrokers);
  await publishLinkCreated(link);
  console.log(`Republished LinkCreated for ${id}`);
} finally {
  await kafkaPublisher.disconnect();
  await mongoose.disconnect();
}
