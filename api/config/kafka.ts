import { Kafka, logLevel } from "kafkajs";

export const linkCreatedTopic = "links.created.v1";

export function createKafkaClient(brokers: string[]) {
  return new Kafka({
    clientId: "link-api",
    brokers,
    logLevel: logLevel.WARN,
    connectionTimeout: 3_000,
    requestTimeout: 10_000,
    retry: { retries: 3 },
  });
}

export async function initializeKafka(brokers: string[]) {
  const kafka = createKafkaClient(brokers);
  const admin = kafka.admin();
  await admin.connect();
  try {
    if (!(await admin.listTopics()).includes(linkCreatedTopic)) {
      await admin.createTopics({
        waitForLeaders: true,
        topics: [{ topic: linkCreatedTopic, numPartitions: 3, replicationFactor: 1 }],
      });
    }
    console.log(`Kafka connected; ${linkCreatedTopic} ready`);
  } finally {
    await admin.disconnect();
  }
}
