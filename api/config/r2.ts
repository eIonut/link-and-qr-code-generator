import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

let client: S3Client | undefined;

export const qrStorage = {
  async get(key: string): Promise<Buffer> {
    const { R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;
    if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
      throw Object.assign(new Error("QR storage is not configured."), { status: 503 });
    }
    client ??= new S3Client({
      region: "auto", endpoint: R2_ENDPOINT, forcePathStyle: true,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
      maxAttempts: 2, requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED",
    });
    const object = await client.send(new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }), {
      abortSignal: AbortSignal.timeout(10_000),
    });
    if (!object.Body) throw new Error("QR image is empty.");
    return Buffer.from(await object.Body.transformToByteArray());
  },
};
