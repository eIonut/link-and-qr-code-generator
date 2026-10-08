import mongoose, { Schema } from "mongoose";

export interface LinkRecord {
  _id: string;
  shortCode: string;
  shortUrl: string;
  destinationUrl: string;
  title: string;
  createdAt: Date;
  qr: {
    status: "pending" | "processing" | "ready" | "failed";
    version: number;
    objectKey: string | null;
    updatedAt: Date;
    errorCode: string | null;
  };
}

const linkSchema = new Schema<LinkRecord>({
  _id: { type: String, required: true },
  shortCode: { type: String, required: true, unique: true },
  shortUrl: { type: String, required: true },
  destinationUrl: { type: String, required: true },
  title: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
  qr: {
    status: { type: String, enum: ["pending", "processing", "ready", "failed"], default: "pending" },
    version: { type: Number, default: 1 },
    objectKey: { type: String, default: null },
    updatedAt: { type: Date, default: Date.now },
    errorCode: { type: String, default: null },
  },
}, { collection: "links", versionKey: false });

export const LinkModel = mongoose.model<LinkRecord>("Link", linkSchema);
