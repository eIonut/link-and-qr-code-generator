import { Router } from "express";
import { redirectLinkHandler } from "../controllers/link-controller.ts";

export const redirectRouter = Router();
redirectRouter.get("/:shortCode", redirectLinkHandler);
