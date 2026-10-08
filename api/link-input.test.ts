import assert from "node:assert/strict";
import { test } from "node:test";
import { ZodError } from "zod";
import { generateShortCode, parseCreateLinkInput } from "./link-input.ts";

test("accepts HTTP/HTTPS URLs and trims form values", () => {
  assert.deepEqual(
    parseCreateLinkInput({
      destinationUrl: " https://example.com/path?q=one#two ",
      title: " Portfolio ",
    }),
    {
      destinationUrl: "https://example.com/path?q=one#two",
      title: "Portfolio",
    },
  );
  assert.equal(
    parseCreateLinkInput({ destinationUrl: "http://localhost:5173" }).destinationUrl,
    "http://localhost:5173",
  );
  assert.equal(
    parseCreateLinkInput({ destinationUrl: "https://example.com", title: "  " }).title,
    undefined,
  );
});

test("rejects unsupported, relative, ambiguous, or credential-bearing URLs", () => {
  for (const destinationUrl of [
    "",
    "/path",
    "//example.com",
    "https:example.com",
    "https:/example.com",
    "https:///example.com",
    "https://\\example.com",
    "javascript:alert(1)",
    "file:///etc/passwd",
    "ftp://example.com",
    "https://user@example.com",
    "https://user:password@example.com",
    "https://@example.com",
    "https://",
    "https://bad host.example",
    "https://exa\nmple.com",
  ]) {
    assert.throws(() => parseCreateLinkInput({ destinationUrl }), ZodError);
  }
});

test("enforces URL/title bounds and input types", () => {
  const urlPrefix = "https://example.com/";
  assert.equal(
    parseCreateLinkInput({
      destinationUrl: urlPrefix + "a".repeat(2048 - urlPrefix.length),
      title: "a".repeat(120),
    }).destinationUrl.length,
    2048,
  );
  for (const value of [
    { destinationUrl: urlPrefix + "a".repeat(2049 - urlPrefix.length) },
    { destinationUrl: urlPrefix, title: "a".repeat(121) },
    { destinationUrl: 123 },
    { destinationUrl: urlPrefix, title: null },
    {},
    null,
  ]) {
    assert.throws(() => parseCreateLinkInput(value), ZodError);
  }
});

test("generates seven-character base62 short codes", () => {
  for (let index = 0; index < 100; index += 1) {
    assert.match(generateShortCode(), /^[0-9A-Za-z]{7}$/);
  }
});
