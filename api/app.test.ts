import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test, type TestContext } from "node:test";
import { createApp } from "./app.ts";
import { LinkModel } from "./link-model.ts";

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
    qr: {
      status: "pending",
      version: 1,
      objectKey: null,
      updatedAt: createdAt,
      errorCode: null,
    },
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
  assert.equal(typeof body.error.code, "string");
  assert.equal(typeof body.error.message, "string");
  assert.ok(body.error.message.length > 0);
  return body;
}

test("creating a link returns the frontend contract with a real ID and pending QR", async (t) => {
  const writes: Record<string, unknown>[] = [];
  t.mock.method(LinkModel, "create", async (input: Record<string, unknown>) => {
    writes.push(input);
    return LinkModel.hydrate({ ...input, createdAt });
  });
  const request = await startApp(t);
  const response = await request("/api/links", createRequest({
    destinationUrl: "  https://example.com/portfolio?campaign=demo  ",
    title: "  Portfolio  ",
  }));

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.match(body.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.match(body.shortCode, /^[A-Za-z0-9]{7}$/);
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
});

test("creating a link without a title returns an empty title", async (t) => {
  t.mock.method(LinkModel, "create", async (input: Record<string, unknown>) =>
    LinkModel.hydrate({ ...input, createdAt }));
  const request = await startApp(t);
  const response = await request("/api/links", createRequest({ destinationUrl: "http://example.com/" }));
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.title, "");
  assert.equal(body.destinationUrl, "http://example.com/");
});

test("invalid destinations and titles are rejected before any database write", async (t) => {
  let writes = 0;
  t.mock.method(LinkModel, "create", async () => {
    writes += 1;
    throw new Error("An invalid request should never reach the database.");
  });
  const request = await startApp(t);
  const invalidBodies = [
    { destinationUrl: "javascript:alert(1)" },
    { destinationUrl: "ftp://example.com/file" },
    { destinationUrl: "/relative/path" },
    { destinationUrl: "https://user:password@example.com/" },
    { destinationUrl: "https://user@example.com/" },
    { destinationUrl: "https://example.com/" + "x".repeat(2_048) },
    { destinationUrl: "https://example.com", title: "x".repeat(121) },
    { destinationUrl: "https://example.com", title: 42 },
    { destinationUrl: 42 },
    {},
    [],
    null,
  ];
  for (const body of invalidBodies) {
    await expectApiError(await request("/api/links", createRequest(body)), 400);
  }
  assert.equal(writes, 0);
});

test("malformed JSON returns a consistent 400 response", async (t) => {
  const request = await startApp(t);
  await expectApiError(await request("/api/links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"destinationUrl":',
  }), 400);
});

test("JSON requests larger than 16 KB are rejected", async (t) => {
  const request = await startApp(t);
  await expectApiError(await request("/api/links", createRequest({
    destinationUrl: "https://example.com",
    title: "x".repeat(17 * 1_024),
  })), 413);
});

test("a duplicate short code is retried with a fresh code", async (t) => {
  const codes: unknown[] = [];
  t.mock.method(LinkModel, "create", async (input: Record<string, unknown>) => {
    codes.push(input.shortCode);
    if (codes.length === 1) {
      throw Object.assign(new Error("Duplicate short code"), {
        code: 11000,
        keyPattern: { shortCode: 1 },
        keyValue: { shortCode: input.shortCode },
      });
    }
    return LinkModel.hydrate({ ...input, createdAt });
  });
  const request = await startApp(t);
  const response = await request("/api/links", createRequest({ destinationUrl: "https://example.com/" }));
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(codes.length, 2);
  assert.notEqual(codes[0], codes[1]);
  assert.equal(body.shortCode, codes[1]);
});

test("repeated short-code collisions stop after a bounded number of attempts", async (t) => {
  let attempts = 0;
  t.mock.method(LinkModel, "create", async () => {
    attempts += 1;
    throw Object.assign(new Error("Duplicate short code"), {
      code: 11000,
      keyPattern: { shortCode: 1 },
    });
  });
  const request = await startApp(t);
  await expectApiError(await request("/api/links", createRequest({ destinationUrl: "https://example.com/" })), 503);
  assert.equal(attempts, 5);
});

test("duplicate keys from other indexes are not mistaken for short-code collisions", async (t) => {
  let attempts = 0;
  t.mock.method(LinkModel, "create", async () => {
    attempts += 1;
    throw Object.assign(new Error("Duplicate document ID"), {
      code: 11000,
      keyPattern: { _id: 1 },
      keyValue: { _id: id },
    });
  });
  const request = await startApp(t);
  const body = await expectApiError(await request("/api/links", createRequest({ destinationUrl: "https://example.com/" })), 500);
  assert.equal(attempts, 1);
  assert.ok(!JSON.stringify(body).includes("Duplicate document ID"));
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

test("database failures return JSON without disclosing database details", async (t) => {
  t.mock.method(LinkModel, "findOne", () => ({
    lean() { return this; },
    async exec() { throw new Error("database at private.internal failed"); },
  }));
  const request = await startApp(t);
  const body = await expectApiError(await request("/r/abc1234", { redirect: "manual" }), 500);
  assert.ok(!JSON.stringify(body).includes("private.internal"));
});
