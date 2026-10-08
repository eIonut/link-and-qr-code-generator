import { randomUUID } from "node:crypto";
import mongoose, { Schema, type Model } from "mongoose";

export type QrStatus = "pending" | "processing" | "ready" | "failed";

export interface LinkRecord {
  _id: string;
  shortCode: string;
  shortUrl: string;
  destinationUrl: string;
  title?: string;
  createdAt: Date;
  qr: {
    status: QrStatus;
    version: number;
    objectKey: string | null;
    updatedAt: Date;
    errorCode: string | null;
  };
}

const qrSchema = new Schema<LinkRecord["qr"]>(
  {
    status: {
      type: String,
      enum: ["pending", "processing", "ready", "failed"],
      default: "pending",
      required: true,
    },
    version: { type: Number, default: 1, min: 1, required: true },
    objectKey: { type: String, default: null },
    updatedAt: { type: Date, default: Date.now, required: true },
    errorCode: { type: String, default: null },
  },
  { _id: false },
);

const linkSchema = new Schema<LinkRecord>(
  {
    _id: { type: String, default: () => randomUUID() },
    shortCode: { type: String, required: true },
    shortUrl: { type: String, required: true },
    destinationUrl: { type: String, required: true, maxlength: 2048 },
    title: { type: String, maxlength: 120 },
    createdAt: { type: Date, default: Date.now, required: true },
    qr: { type: qrSchema, default: () => ({}), required: true },
  },
  { collection: "links", versionKey: false },
);

linkSchema.index({ shortCode: 1 }, { unique: true });
linkSchema.index({ createdAt: -1, _id: -1 });

export const LinkModel: Model<LinkRecord> =
  (mongoose.models.Link as Model<LinkRecord> | undefined) ??
  mongoose.model<LinkRecord>("Link", linkSchema);
