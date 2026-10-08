import { randomUUID } from "node:crypto";
import { LinkModel } from "../models/link.ts";
import { type CreateLinkInput } from "../schemas/link.ts";

export function createLink(input: CreateLinkInput, shortBaseUrl: string) {
  const id = randomUUID();
  return LinkModel.create({
    _id: id,
    shortCode: id,
    shortUrl: `${shortBaseUrl}/${id}`,
    ...input,
  });
}

export function getLinkById(id: string) {
  return LinkModel.findById(id).lean().exec();
}

export function getLinkByShortCode(shortCode: string) {
  return LinkModel.findOne({ shortCode }).lean().exec();
}
