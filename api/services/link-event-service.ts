import { kafkaPublisher, linkCreatedTopic } from "../config/kafka.ts";
import { type LinkCreatedEvent } from "../models/link-created-event.ts";
import { type LinkRecord } from "../models/link.ts";

export async function publishLinkCreated(link: LinkRecord) {
  const event: LinkCreatedEvent = {
    // Each link has one creation event; reuse its UUID when republishing.
    eventId: link._id,
    eventType: "LinkCreated",
    schemaVersion: 1,
    occurredAt: link.createdAt.toISOString(),
    payload: {
      linkId: link._id,
      shortUrl: link.shortUrl,
      qrVersion: link.qr.version,
    },
  };
  await kafkaPublisher.publish(linkCreatedTopic, link._id, event);
  console.log("LinkCreated published", { linkId: link._id, eventId: event.eventId });
}
