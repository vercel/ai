import { LanguageModelV3Usage } from '@ai-sdk/provider';

export type AnthropicMessagesUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

export function convertAnthropicMessagesUsage(
  usage: AnthropicMessagesUsage,
): LanguageModelV3Usage {
  const inputTokens = usage.input_tokens;
  const outputTokens = usage.output_tokens;
  const cacheCreationTokens = usage.cache_creation_input_tokens ?? 0;
  const cacheReadTokens = usage.cache_read_input_tokens ?? 0;

  return {
    inputTokens: {
      total: inputTokens + cacheCreationTokens + cacheReadTokens,
      noCache: inputTokens,
      cacheRead: cacheReadTokens,
      cacheWrite: cacheCreationTokens,
    },
    outputTokens: {
      total: outputTokens,
      text: undefined,
      reasoning: undefined,
    },
    raw: usage,
  };
}
