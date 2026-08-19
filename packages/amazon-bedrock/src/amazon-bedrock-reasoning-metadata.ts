import { z } from 'zod/v4';

export const amazonBedrockReasoningMetadataSchema = z.object({
  signature: z.string().optional(),
  redactedData: z.string().optional(),
  /**
   * Encrypted reasoning content returned by the model provider
   * (`reasoningContent.redactedContent` in the Converse API), e.g. for
   * OpenAI models served via Bedrock. Base64-encoded opaque state.
   */
  redactedContent: z.string().optional(),
});

export type AmazonBedrockReasoningMetadata = z.infer<
  typeof amazonBedrockReasoningMetadataSchema
>;
