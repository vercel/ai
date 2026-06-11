import { z } from 'zod/v4';

export const bedrockReasoningMetadataSchema = z.object({
  signature: z.string().optional(),
  redactedData: z.string().optional(),
});

export type BedrockReasoningMetadata = z.infer<
  typeof bedrockReasoningMetadataSchema
>;
