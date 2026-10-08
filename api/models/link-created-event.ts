export type LinkCreatedEvent = {
  eventId: string;
  eventType: "LinkCreated";
  schemaVersion: 1;
  occurredAt: string;
  payload: {
    linkId: string;
    shortUrl: string;
    qrVersion: number;
  };
};
