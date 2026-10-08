import { type ErrorRequestHandler, type RequestHandler } from "express";
import { ZodError } from "zod";

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { message: "Not found." } });
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const status = error instanceof ZodError ? 400 : (error.status ?? 500);
  const message = error instanceof ZodError
    ? error.issues[0].message
    : status === 500 ? "Something went wrong." : error.message;
  if (status === 500) console.error(error.message);
  res.status(status).json({ error: { message } });
};
