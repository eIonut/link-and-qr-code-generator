import { qrStorage } from "../config/r2.ts";
import { type LinkRecord } from "../models/link.ts";
import { getLinkById } from "./link-service.ts";

export function qrImageUrl(link: LinkRecord) {
  const baseUrl = process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "");
  return link.qr.status === "ready" && link.qr.objectKey && baseUrl
    ? `${baseUrl}/${link.qr.objectKey}` : null;
}

export async function downloadQr(id: string) {
  const link = await getLinkById(id);
  if (!link) throw Object.assign(new Error("Link not found."), { status: 404 });
  if (link.qr.status !== "ready" || !link.qr.objectKey) {
    throw Object.assign(new Error("QR code is not ready yet."), { status: 409 });
  }
  return { png: await qrStorage.get(link.qr.objectKey), filename: `${link.shortCode}-qr.png` };
}
