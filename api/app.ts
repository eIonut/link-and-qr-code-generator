import express from "express";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.ts";
import { createRouter } from "./routes/index.ts";

type AppOptions = { shortBaseUrl: string };

export function createApp({ shortBaseUrl }: AppOptions) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());
  app.use(createRouter(shortBaseUrl.replace(/\/$/, "")));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
