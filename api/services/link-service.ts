import { randomUUID } from "node:crypto";
import { LinkModel } from "../models/link.ts";
import { type CreateLinkInput } from "../schemas/link.ts";
import { publishLinkCreated } from "./link-event-service.ts";

export async function createLink(input: CreateLinkInput, shortBaseUrl: string) {
  const id = randomUUID();
  const link = await LinkModel.create({
    _id: id,
    shortCode: id,
    shortUrl: `${shortBaseUrl}/${id}`,
    ...input,
  });
  let warning: { code: string; message: string } | undefined;
  try {
    await publishLinkCreated(link);
  } catch (error) {
    console.warn("LinkCreated publishing failed", { linkId: id, error });
    warning = {
      code: "LINK_CREATED_PUBLISH_FAILED",
      message: "Your link was saved, but QR generation could not be queued.",
    };
  }
  return { link, warning };
}

export function getLinkById(id: string) {
  return LinkModel.findById(id).lean().exec();
}

export function listLinks() {
  return LinkModel.find().sort({ createdAt: -1, _id: -1 }).lean().exec();
}

export function getLinkByShortCode(shortCode: string) {
  return LinkModel.findOne({ shortCode }).lean().exec();
}
