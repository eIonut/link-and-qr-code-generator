import assert from "node:assert/strict";
import { test } from "node:test";
import { ZodError } from "zod";
import { parseCreateLinkInput } from "../schemas/link.ts";

test("accepts HTTP/HTTPS URLs and trims form values", () => {
  assert.deepEqual(parseCreateLinkInput({
    destinationUrl: " https://example.com/path ",
    title: " Portfolio ",
  }), { destinationUrl: "https://example.com/path", title: "Portfolio" });
  assert.equal(parseCreateLinkInput({ destinationUrl: "http://localhost:5173" }).title, undefined);
});

test("rejects invalid and unsupported URLs", () => {
  for (const destinationUrl of ["not-a-url", "/relative", "ftp://example.com"]) {
    assert.throws(() => parseCreateLinkInput({ destinationUrl }), ZodError);
  }
});
