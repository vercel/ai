import { LanguageModelV3Usage } from '@ai-sdk/provider';
import { convertOpenAICompatibleChatUsage } from '@ai-sdk/openai-compatible/internal';

export type AlibabaUsage = {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  prompt_tokens_details?: {
    cached_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  } | null;
  completion_tokens_details?: {
    reasoning_tokens?: number | null;
  } | null;
};

/**
 * Converts Alibaba usage to AI SDK usage format.
 * Extends the base OpenAI-compatible converter to handle Alibaba's
 * `cache_creation_input_tokens` field.
 */
export function convertAlibabaUsage(
  usage: AlibabaUsage | undefined | null,
): LanguageModelV3Usage {
  // Use base converter for standard fields
  const baseUsage = convertOpenAICompatibleChatUsage(usage);

  // Add Alibaba-specific cache_creation_input_tokens to cacheWrite
  const cacheWriteTokens =
    usage?.prompt_tokens_details?.cache_creation_input_tokens ?? 0;

  return {
    ...baseUsage,
    inputTokens: {
      ...baseUsage.inputTokens,
      cacheWrite: cacheWriteTokens,
    },
  };
}
