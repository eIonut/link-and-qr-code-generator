import { type RequestHandler } from "express";
import { downloadQr } from "../services/qr-service.ts";

export const downloadQrHandler: RequestHandler<{ id: string }> = async (req, res) => {
  const { png, filename } = await downloadQr(req.params.id);
  res.attachment(filename).type("png").send(png);
};
