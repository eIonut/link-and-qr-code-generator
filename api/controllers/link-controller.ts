import { type RequestHandler } from "express";
import { type LinkRecord } from "../models/link.ts";
import { parseCreateLinkInput } from "../schemas/link.ts";
import { createLink, getLinkById, listLinks } from "../services/link-service.ts";
import { resolveRedirect } from "../services/redirect-service.ts";
import { qrImageUrl } from "../services/qr-service.ts";

function serializeLink(link: LinkRecord) {
  return {
    id: link._id,
    shortCode: link.shortCode,
    shortUrl: link.shortUrl,
    destinationUrl: link.destinationUrl,
    title: link.title ?? "",
    createdAt: link.createdAt.toISOString(),
    qr: { status: link.qr.status, imageUrl: qrImageUrl(link) },
  };
}

export function createLinkHandler(shortBaseUrl: string): RequestHandler {
  return async (req, res) => {
    const input = parseCreateLinkInput(req.body);
    const { link, warning } = await createLink(input, shortBaseUrl);
    res.status(201).json({ ...serializeLink(link), ...(warning && { warning }) });
  };
}

export const getLinkHandler: RequestHandler<{ id: string }> = async (req, res) => {
  const link = await getLinkById(req.params.id);
  if (!link) {
    res.status(404).json({ error: { message: "Link not found." } });
    return;
  }
  res.json(serializeLink(link));
};

export const listLinksHandler: RequestHandler = async (_req, res) => {
  const links = await listLinks();
  res.json(links.map(serializeLink));
};

export const redirectLinkHandler: RequestHandler<{ shortCode: string }> = async (req, res) => {
  const link = await resolveRedirect(req.params.shortCode);
  if (!link) {
    res.status(404).json({ error: { message: "Link not found." } });
    return;
  }
  res.set("Cache-Control", "no-store");
  res.redirect(302, link.destinationUrl);
};
