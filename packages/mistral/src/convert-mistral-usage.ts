import { LanguageModelV3Usage } from '@ai-sdk/provider';

export type MistralUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

export function convertMistralUsage(
  usage: MistralUsage | undefined | null,
): LanguageModelV3Usage {
  if (usage == null) {
    return {
      inputTokens: {
        total: undefined,
        noCache: undefined,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: undefined,
        text: undefined,
        reasoning: undefined,
      },
      raw: undefined,
    };
  }

  const promptTokens = usage.prompt_tokens;
  const completionTokens = usage.completion_tokens;

  return {
    inputTokens: {
      total: promptTokens,
      noCache: promptTokens,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: completionTokens,
      text: completionTokens,
      reasoning: undefined,
    },
    raw: usage,
  };
}
