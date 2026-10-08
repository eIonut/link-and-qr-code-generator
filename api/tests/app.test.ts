import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test, type TestContext } from "node:test";
import { createApp } from "../app.ts";
import { LinkModel } from "../models/link.ts";
import { kafkaPublisher, linkCreatedTopic } from "../config/kafka.ts";
import { type LinkCreatedEvent } from "../models/link-created-event.ts";
import { qrStorage } from "../config/r2.ts";

const id = "7ced6051-8a2d-4a7d-a57d-9bd1fa9db3e0";
const shortBaseUrl = "https://short.example/r";
const createdAt = new Date("2026-10-08T10:00:00.000Z");

function savedLink(overrides: Record<string, unknown> = {}) {
  return {
    _id: id,
    shortCode: "abc1234",
    shortUrl: `${shortBaseUrl}/abc1234`,
    destinationUrl: "https://example.com/portfolio?campaign=demo",
    title: "Portfolio",
    createdAt,
    qr: { status: "pending", version: 1, objectKey: null, updatedAt: createdAt, errorCode: null },
    ...overrides,
  };
}

function queryResult(result: unknown) {
  return {
    lean() {
      return this;
    },
    async exec() {
      return result;
    },
  };
}

async function startApp(t: TestContext) {
  const server = createServer(createApp({ shortBaseUrl }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return (path: string, init: RequestInit = {}) =>
    fetch(`${baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(3_000) });
}

function createRequest(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function expectApiError(response: Response, status: number) {
  assert.equal(response.status, status);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  const body = await response.json();
  assert.equal(typeof body.error.message, "string");
  assert.ok(body.error.message.length > 0);
  return body;
}

test("creating a link returns the frontend contract with a real ID and pending QR", async (t) => {
  const writes: Record<string, unknown>[] = [];
  const events: { topic: string; key: string; event: LinkCreatedEvent }[] = [];
  t.mock.method(LinkModel, "create", async (input: Record<string, unknown>) => {
    writes.push(input);
    return LinkModel.hydrate({ ...input, createdAt });
  });
  t.mock.method(kafkaPublisher, "publish", async (topic: string, key: string, event: LinkCreatedEvent) => {
    assert.equal(writes.length, 1, "publish only after the link is saved");
    events.push({ topic, key, event });
  });
  const request = await startApp(t);
  const response = await request("/api/links", createRequest({
    destinationUrl: "  https://example.com/portfolio?campaign=demo  ",
    title: "  Portfolio  ",
  }));

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.match(body.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(body.shortCode, body.id);
  assert.equal(body.shortUrl, `${shortBaseUrl}/${body.shortCode}`);
  assert.equal(body.destinationUrl, "https://example.com/portfolio?campaign=demo");
  assert.equal(body.title, "Portfolio");
  assert.equal(body.createdAt, createdAt.toISOString());
  assert.equal(body.qr.status, "pending");
  assert.equal(body.qr.imageUrl, null);
  assert.equal(body._id, undefined);
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.destinationUrl, body.destinationUrl);
  assert.equal(writes[0]?.shortUrl, body.shortUrl);
  assert.equal(body.warning, undefined);
  assert.deepEqual(events, [{
    topic: linkCreatedTopic,
    key: body.id,
    event: {
      eventId: body.id,
      eventType: "LinkCreated",
      schemaVersion: 1,
      occurredAt: createdAt.toISOString(),
      payload: { linkId: body.id, shortUrl: body.shortUrl, qrVersion: 1 },
    },
  }]);
});

test("creating a link without a title returns an empty title", async (t) => {
  t.mock.method(kafkaPublisher, "publish", async () => {});
  t.mock.method(LinkModel, "create", async (input: Record<string, unknown>) =>
    LinkModel.hydrate({ ...input, createdAt }));
  const request = await startApp(t);
  const response = await request("/api/links", createRequest({ destinationUrl: "http://example.com/" }));
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.title, "");
  assert.equal(body.destinationUrl, "http://example.com/");
});

test("invalid destinations are rejected before a database write", async (t) => {
  let writes = 0;
  const publish = t.mock.method(kafkaPublisher, "publish", async () => {});
  t.mock.method(LinkModel, "create", async () => { writes += 1; });
  const request = await startApp(t);
  for (const destinationUrl of ["not-a-url", "ftp://example.com"]) {
    await expectApiError(await request("/api/links", createRequest({ destinationUrl })), 400);
  }
  assert.equal(writes, 0);
  assert.equal(publish.mock.callCount(), 0);
});

test("a Kafka failure preserves the saved link and returns a pending QR with a warning", async (t) => {
  const writes: Record<string, unknown>[] = [];
  t.mock.method(LinkModel, "create", async (input: Record<string, unknown>) => {
    writes.push(input);
    return LinkModel.hydrate({ ...input, createdAt });
  });
  t.mock.method(kafkaPublisher, "publish", async () => { throw new Error("Broker unavailable"); });
  const request = await startApp(t);
  const response = await request("/api/links", createRequest({ destinationUrl: "https://example.com/" }));
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(writes.length, 1);
  assert.equal(body.id, writes[0]?._id);
  assert.equal(body.qr.status, "pending");
  assert.equal(body.warning.code, "LINK_CREATED_PUBLISH_FAILED");
});

test("a failed MongoDB insert does not publish an event", async (t) => {
  t.mock.method(LinkModel, "create", async () => { throw new Error("Database unavailable"); });
  const publish = t.mock.method(kafkaPublisher, "publish", async () => {});
  const request = await startApp(t);
  await expectApiError(await request("/api/links", createRequest({ destinationUrl: "https://example.com/" })), 500);
  assert.equal(publish.mock.callCount(), 0);
});

test("known short links return 302 with the saved destination and no-store", async (t) => {
  const link = savedLink();
  const lookups: unknown[] = [];
  t.mock.method(LinkModel, "findOne", (filter: unknown) => {
    lookups.push(filter);
    return queryResult(link);
  });
  const request = await startApp(t);
  const response = await request("/r/abc1234", { redirect: "manual" });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), link.destinationUrl);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(lookups, [{ shortCode: "abc1234" }]);
  await response.text();
});

test("unknown short codes return 404", async (t) => {
  t.mock.method(LinkModel, "findOne", () => queryResult(null));
  const request = await startApp(t);
  await expectApiError(await request("/r/missing", { redirect: "manual" }), 404);
});

test("link detail exposes the same public contract for QR polling", async (t) => {
  const lookups: unknown[] = [];
  t.mock.method(LinkModel, "findById", (linkId: unknown) => {
    lookups.push(linkId);
    return queryResult(savedLink());
  });
  const request = await startApp(t);
  const response = await request(`/api/links/${id}`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.id, id);
  assert.equal(body.shortCode, "abc1234");
  assert.equal(body.createdAt, createdAt.toISOString());
  assert.equal(body.qr.status, "pending");
  assert.equal(body.qr.imageUrl, null);
  assert.equal(body._id, undefined);
  assert.deepEqual(lookups, [id]);
});

test("missing link detail returns 404", async (t) => {
  t.mock.method(LinkModel, "findById", () => queryResult(null));
  const request = await startApp(t);
  await expectApiError(await request(`/api/links/${id}`), 404);
});

test("saved links list returns public link details including pending and ready QRs", async (t) => {
  const previous = process.env.R2_PUBLIC_BASE_URL;
  process.env.R2_PUBLIC_BASE_URL = "https://images.example.com";
  t.after(() => {
    if (previous === undefined) delete process.env.R2_PUBLIC_BASE_URL;
    else process.env.R2_PUBLIC_BASE_URL = previous;
  });
  const newerId = "53a1c98e-d84c-4986-b142-2a0fd9f8d697";
  const objectKey = `qr/${newerId}/v1.png`;
  const newer = savedLink({
    _id: newerId, shortCode: newerId, shortUrl: `${shortBaseUrl}/${newerId}`,
    createdAt: new Date("2026-10-08T11:00:00.000Z"),
    qr: { status: "ready", objectKey },
  });
  t.mock.method(LinkModel, "find", () => ({ sort: () => queryResult([newer, savedLink()]) }));
  const request = await startApp(t);
  const response = await request("/api/links");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.map((link: { id: string }) => link.id), [newerId, id]);
  assert.equal(body[0].title, "Portfolio");
  assert.equal(body[0].destinationUrl, newer.destinationUrl);
  assert.equal(body[0].shortUrl, newer.shortUrl);
  assert.equal(body[0].createdAt, newer.createdAt.toISOString());
  assert.deepEqual(body[0].qr, { status: "ready", imageUrl: `https://images.example.com/${objectKey}` });
  assert.deepEqual(body[1].qr, { status: "pending", imageUrl: null });
  assert.equal(body[0]._id, undefined);
  assert.equal(body[0].qr.objectKey, undefined);
});

test("saved links list returns an empty array when no links exist", async (t) => {
  t.mock.method(LinkModel, "find", () => ({ sort: () => queryResult([]) }));
  const request = await startApp(t);
  const response = await request("/api/links");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), []);
});

test("ready QR detail returns its public R2 image URL", async (t) => {
  const previous = process.env.R2_PUBLIC_BASE_URL;
  process.env.R2_PUBLIC_BASE_URL = "https://images.example.com/";
  t.after(() => {
    if (previous === undefined) delete process.env.R2_PUBLIC_BASE_URL;
    else process.env.R2_PUBLIC_BASE_URL = previous;
  });
  const objectKey = `qr/${id}/v1.png`;
  t.mock.method(LinkModel, "findById", () => queryResult(savedLink({ qr: { status: "ready", objectKey } })));
  const request = await startApp(t);
  const response = await request(`/api/links/${id}`);
  const body = await response.json();
  assert.equal(body.qr.imageUrl, `https://images.example.com/${objectKey}`);
});

test("ready QR downloads the saved R2 object as a PNG attachment", async (t) => {
  const objectKey = `qr/${id}/v1.png`;
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  t.mock.method(LinkModel, "findById", () => queryResult(savedLink({ qr: { status: "ready", objectKey } })));
  t.mock.method(qrStorage, "get", async (key: string) => {
    assert.equal(key, objectKey);
    return png;
  });
  const request = await startApp(t);
  const response = await request(`/api/links/${id}/qr/download`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^image\/png/);
  assert.match(response.headers.get("content-disposition") ?? "", /attachment; filename="abc1234-qr.png"/);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
});

test("missing or pending QR downloads do not read R2", async (t) => {
  const get = t.mock.method(qrStorage, "get", async () => Buffer.alloc(0));
  const request = await startApp(t);
  t.mock.method(LinkModel, "findById", () => queryResult(null));
  await expectApiError(await request(`/api/links/${id}/qr/download`), 404);
  t.mock.method(LinkModel, "findById", () => queryResult(savedLink()));
  await expectApiError(await request(`/api/links/${id}/qr/download`), 409);
  assert.equal(get.mock.callCount(), 0);
});
