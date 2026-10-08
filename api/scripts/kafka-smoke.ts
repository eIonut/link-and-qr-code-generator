import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { Partitioners } from "kafkajs";
import { readEnvironment } from "../config/environment.ts";
import { createKafkaClient } from "../config/kafka.ts";

dotenv.config();
const kafka = createKafkaClient(readEnvironment().kafkaBrokers);
const topic = "poc.smoke.v1";
const admin = kafka.admin();
const producer = kafka.producer({ createPartitioner: Partitioners.DefaultPartitioner });
const consumer = kafka.consumer({ groupId: "poc-smoke-v1" });
const key = randomUUID();
const value = JSON.stringify({ message: "Hello from KafkaJS", id: key });
let receive: (value: string) => void;
const received = new Promise<string>((resolve) => { receive = resolve; });
let timeout: ReturnType<typeof setTimeout> | undefined;

try {
  await admin.connect();
  if (!(await admin.listTopics()).includes(topic)) {
    await admin.createTopics({
      waitForLeaders: true,
      topics: [{ topic, numPartitions: 1, replicationFactor: 1 }],
    });
  }
  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning: true });
  await producer.send({ topic, messages: [{ key, value }] });
  await consumer.run({
    eachMessage: async ({ partition, message }) => {
      if (message.key?.toString() === key) {
        console.log(`Consumed ${topic}, partition ${partition}, offset ${message.offset}`);
        receive(message.value!.toString());
      }
    },
  });
  assert.equal(await Promise.race([
    received,
    new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => reject(new Error("Kafka smoke test timed out.")), 15_000);
    }),
  ]), value);
  console.log("KafkaJS produce/consume smoke test passed.");
} finally {
  clearTimeout(timeout);
  await consumer.disconnect();
  await producer.disconnect();
  await admin.disconnect();
}
