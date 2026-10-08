import { Router } from "express";
import { createLinksRouter } from "./links.ts";
import { redirectRouter } from "./redirect.ts";

export function createRouter(shortBaseUrl: string) {
  const router = Router();
  router.get("/", (_req, res) => {
    res.json({ message: "Hello from the API!" });
  });
  router.use("/api/links", createLinksRouter(shortBaseUrl));
  router.use("/r", redirectRouter);
  return router;
}
