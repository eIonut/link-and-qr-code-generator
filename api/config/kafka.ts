import { Kafka, logLevel, Partitioners, type Producer } from "kafkajs";

export const linkCreatedTopic = "links.created.v1";
let producer: Producer | undefined;

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
  } finally {
    await admin.disconnect();
  }
  producer = kafka.producer({
    createPartitioner: Partitioners.DefaultPartitioner,
    allowAutoTopicCreation: false,
    retry: { retries: 2, initialRetryTime: 100, maxRetryTime: 1_000 },
  });
  await producer.connect();
  console.log(`Kafka producer connected; ${linkCreatedTopic} ready`);
}

export const kafkaPublisher = {
  async publish(topic: string, key: string, event: object) {
    if (!producer) throw new Error("Kafka producer is not connected.");
    await producer.send({
      topic,
      messages: [{ key, value: JSON.stringify(event) }],
      acks: -1,
      timeout: 5_000,
    });
  },
  async disconnect() {
    await producer?.disconnect();
  },
};
