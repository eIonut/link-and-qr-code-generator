import assert from "node:assert/strict";
import { test } from "node:test";
import { redirectCache } from "../config/redis.ts";
import { LinkModel } from "../models/link.ts";
import { resolveRedirect } from "../services/redirect-service.ts";

const code = "example-link";
const redirect = { id: "example-id", destinationUrl: "https://example.com" };

function databaseResult() {
  return {
    lean() { return this; },
    async exec() { return { _id: redirect.id, destinationUrl: redirect.destinationUrl }; },
  };
}

test("a cache miss reads MongoDB and caches the redirect", async (t) => {
  t.mock.method(redirectCache, "get", async (key: string) => {
    assert.equal(key, code);
    return null;
  });
  const lookup = t.mock.method(LinkModel, "findOne", (filter: unknown) => {
    assert.deepEqual(filter, { shortCode: code });
    return databaseResult();
  });
  const writes: unknown[] = [];
  t.mock.method(redirectCache, "set", async (key: string, value: unknown) => {
    writes.push({ key, value });
  });

  assert.deepEqual(await resolveRedirect(code), redirect);
  assert.equal(lookup.mock.callCount(), 1);
  assert.deepEqual(writes, [{ key: code, value: redirect }]);
});

test("a cache hit skips MongoDB", async (t) => {
  t.mock.method(redirectCache, "get", async () => redirect);
  const lookup = t.mock.method(LinkModel, "findOne", () => {
    throw new Error("A cache hit should not query MongoDB.");
  });
  const write = t.mock.method(redirectCache, "set", async () => {});

  assert.deepEqual(await resolveRedirect(code), redirect);
  assert.equal(lookup.mock.callCount(), 0);
  assert.equal(write.mock.callCount(), 0);
});

test("Redis read and write failures still return the MongoDB destination", async (t) => {
  t.mock.method(redirectCache, "get", async () => { throw new Error("Redis unavailable"); });
  t.mock.method(redirectCache, "set", async () => { throw new Error("Redis unavailable"); });
  const lookup = t.mock.method(LinkModel, "findOne", () => databaseResult());

  assert.deepEqual(await resolveRedirect(code), redirect);
  assert.equal(lookup.mock.callCount(), 1);
});
