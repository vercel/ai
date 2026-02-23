import { LanguageModelV3Usage } from '@ai-sdk/provider';

export type BedrockUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens?: number;
  cacheReadInputTokens?: number | null;
  cacheWriteInputTokens?: number | null;
};

export function convertBedrockUsage(
  usage: BedrockUsage | undefined | null,
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

  const inputTokens = usage.inputTokens;
  const outputTokens = usage.outputTokens;
  const cacheReadTokens = usage.cacheReadInputTokens ?? 0;
  const cacheWriteTokens = usage.cacheWriteInputTokens ?? 0;

  return {
    inputTokens: {
      total: inputTokens + cacheReadTokens + cacheWriteTokens,
      noCache: inputTokens,
      cacheRead: cacheReadTokens,
      cacheWrite: cacheWriteTokens,
    },
    outputTokens: {
      total: outputTokens,
      text: outputTokens,
      reasoning: undefined,
    },
    raw: usage,
  };
}
