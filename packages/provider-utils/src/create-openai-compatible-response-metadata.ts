import type { LanguageModelV4ResponseMetadata } from '@ai-sdk/provider';

/**
 * Converts OpenAI-compatible response fields into language model response
 * metadata.
 */
export function createOpenAICompatibleResponseMetadata({
  id,
  model,
  created,
}: {
  id?: string | null;
  model?: string | null;
  created?: number | null;
}): LanguageModelV4ResponseMetadata {
  return {
    id: id ?? undefined,
    modelId: model ?? undefined,
    timestamp: created != null ? new Date(created * 1000) : undefined,
  };
}
