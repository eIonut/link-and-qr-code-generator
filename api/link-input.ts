import { randomInt } from "node:crypto";
import { z } from "zod";

const shortCodeAlphabet =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

const createLinkInputSchema = z.object({
  destinationUrl: z
    .string()
    .trim()
    .min(1, "Enter a destination URL.")
    .max(2048, "Destination URLs must be at most 2,048 characters.")
    .superRefine((value, context) => {
      // URL accepts inputs such as `https:example.com`; require an explicit authority.
      if (
        !/^https?:\/\/[^/\\?#]/i.test(value) ||
        value.includes("\\") ||
        /[\u0000-\u001f\u007f]/.test(value)
      ) {
        context.addIssue({
          code: "custom",
          message: "Enter an absolute HTTP or HTTPS URL.",
        });
        return;
      }

      try {
        const url = new URL(value);
        if (!url.hostname || !["http:", "https:"].includes(url.protocol)) {
          context.addIssue({
            code: "custom",
            message: "Enter an absolute HTTP or HTTPS URL.",
          });
        } else if (
          url.username ||
          url.password ||
          value.split(/[/?#]/)[2]?.includes("@")
        ) {
          context.addIssue({
            code: "custom",
            message: "Destination URLs must not include a username or password.",
          });
        }
      } catch {
        context.addIssue({
          code: "custom",
          message: "Enter an absolute HTTP or HTTPS URL.",
        });
      }
    }),
  title: z
    .string()
    .trim()
    .max(120, "Titles must be at most 120 characters.")
    .optional()
    .transform((value) => value || undefined),
});

export type CreateLinkInput = z.infer<typeof createLinkInputSchema>;

export function parseCreateLinkInput(value: unknown): CreateLinkInput {
  return createLinkInputSchema.parse(value);
}

export function generateShortCode(): string {
  return Array.from({ length: 7 }, () =>
    shortCodeAlphabet[randomInt(shortCodeAlphabet.length)],
  ).join("");
}
