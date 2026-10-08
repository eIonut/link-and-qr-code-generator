import { randomUUID } from "node:crypto";
import express, { type ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { LinkModel, type LinkRecord } from "./link-model.ts";
import { generateShortCode, parseCreateLinkInput } from "./link-input.ts";

type AppOptions = { shortBaseUrl: string };
const MAX_CODE_ATTEMPTS = 5;

function serializeLink(link: LinkRecord) {
  return {
    id: link._id,
    shortCode: link.shortCode,
    shortUrl: link.shortUrl,
    destinationUrl: link.destinationUrl,
    title: link.title ?? "",
    createdAt: link.createdAt.toISOString(),
    qr: { status: link.qr.status, imageUrl: null },
  };
}

function isShortCodeCollision(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const duplicate = error as {
    code?: number;
    keyPattern?: Record<string, unknown>;
    keyValue?: Record<string, unknown>;
  };
  return duplicate.code === 11000 &&
    (Object.hasOwn(duplicate.keyPattern ?? {}, "shortCode") ||
      Object.hasOwn(duplicate.keyValue ?? {}, "shortCode"));
}

function normalizeShortBaseUrl(value: string): string {
  const url = new URL(value);
  if (!(["http:", "https:"].includes(url.protocol)) ||
    url.username || url.password || url.search || url.hash ||
    url.pathname.replace(/\/+$/, "") !== "/r") {
    throw new Error("SHORT_BASE_URL must be an HTTP(S) URL ending in /r, without credentials, query, or fragment.");
  }
  return url.toString().replace(/\/+$/, "");
}

export function createApp({ shortBaseUrl }: AppOptions) {
  const normalizedShortBaseUrl = normalizeShortBaseUrl(shortBaseUrl);
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));

  app.get("/", (_req, res) => {
    res.json({ message: "Hello from the API!" });
  });

  app.post("/api/links", async (req, res) => {
    const input = parseCreateLinkInput(req.body);
    const id = randomUUID();
    const now = new Date();
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      const shortCode = generateShortCode();
      try {
        const link = await LinkModel.create({
          _id: id,
          shortCode,
          shortUrl: `${normalizedShortBaseUrl}/${shortCode}`,
          destinationUrl: input.destinationUrl,
          title: input.title,
          createdAt: now,
          qr: {
            status: "pending",
            version: 1,
            objectKey: null,
            updatedAt: now,
            errorCode: null,
          },
        });
        res.status(201).json(serializeLink(link));
        return;
      } catch (error) {
        if (!isShortCodeCollision(error)) throw error;
      }
    }
    res.status(503).json({
      error: { code: "SHORT_CODE_UNAVAILABLE", message: "Could not create a unique short link. Please try again." },
    });
  });

  app.get("/api/links/:id", async (req, res) => {
    const link = await LinkModel.findById(req.params.id).lean().exec();
    if (!link) {
      res.status(404).json({ error: { code: "LINK_NOT_FOUND", message: "The requested link was not found." } });
      return;
    }
    res.json(serializeLink(link));
  });

  app.get("/r/:shortCode", async (req, res) => {
    const link = await LinkModel.findOne({ shortCode: req.params.shortCode }).lean().exec();
    if (!link) {
      res.status(404).json({ error: { code: "LINK_NOT_FOUND", message: "The requested link was not found." } });
      return;
    }
    res.set("Cache-Control", "no-store");
    res.redirect(302, link.destinationUrl);
  });

  app.use((_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "The requested endpoint was not found." } });
  });

  const handleError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: { code: "INVALID_REQUEST", message: error.issues[0]?.message ?? "The request is invalid." },
      });
      return;
    }
    const type = typeof error === "object" && error !== null && "type" in error ? error.type : undefined;
    if (type === "entity.too.large") {
      res.status(413).json({ error: { code: "BODY_TOO_LARGE", message: "The request body must be at most 16 KB." } });
      return;
    }
    if (type === "entity.parse.failed") {
      res.status(400).json({ error: { code: "INVALID_JSON", message: "The request body must contain valid JSON." } });
      return;
    }
    // Avoid logging destination URLs, credentials, or database error details.
    console.error("API request failed", { code: "INTERNAL_ERROR" });
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "The link service could not complete the request. Please try again." } });
  };
  app.use(handleError);
  return app;
}
