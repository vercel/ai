import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const amazonBedrockReasoningMetadataSchema = lazySchema(() =>
  zodSchema(
    z.object({
      signature: z.string().optional(),
      redactedData: z.string().optional(),
      redactedContent: z.string().optional(),
    }),
  ),
);

export type AmazonBedrockReasoningMetadata = InferSchema<
  typeof amazonBedrockReasoningMetadataSchema
>;
