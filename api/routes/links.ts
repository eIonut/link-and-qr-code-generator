import { Router } from "express";
import { createLinkHandler, getLinkHandler } from "../controllers/link-controller.ts";
import { downloadQrHandler } from "../controllers/qr-controller.ts";

export function createLinksRouter(shortBaseUrl: string) {
  const router = Router();
  router.post("/", createLinkHandler(shortBaseUrl));
  router.get("/:id", getLinkHandler);
  router.get("/:id/qr/download", downloadQrHandler);
  return router;
}
