import { z } from "zod";

const createLinkInputSchema = z.object({
  destinationUrl: z.string().trim().pipe(z.url({
    protocol: /^https?$/,
    error: "Enter an HTTP or HTTPS URL.",
  })),
  title: z.string().trim().optional(),
});

export type CreateLinkInput = z.infer<typeof createLinkInputSchema>;

export function parseCreateLinkInput(value: unknown): CreateLinkInput {
  return createLinkInputSchema.parse(value);
}
