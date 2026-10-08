import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import { kafkaPublisher } from "../config/kafka.ts";
import { LinkModel } from "../models/link.ts";
import { createLink } from "../services/link-service.ts";

test("link creation waits for the publisher acknowledgment", async (t) => {
  let acknowledge!: () => void;
  let started!: () => void;
  const acknowledgment = new Promise<void>((resolve) => { acknowledge = resolve; });
  const publishing = new Promise<void>((resolve) => { started = resolve; });
  t.after(() => acknowledge());
  t.mock.method(LinkModel, "create", async (input: Record<string, unknown>) =>
    LinkModel.hydrate(input));
  t.mock.method(kafkaPublisher, "publish", async () => {
    started();
    await acknowledgment;
  });

  let returned = false;
  const creation = createLink({ destinationUrl: "https://example.com/" }, "https://short.example/r")
    .then((result) => { returned = true; return result; });
  await publishing;
  await setImmediate();
  assert.equal(returned, false);
  acknowledge();
  const result = await creation;
  assert.equal(result.warning, undefined);
  assert.equal(result.link.qr.status, "pending");
});
