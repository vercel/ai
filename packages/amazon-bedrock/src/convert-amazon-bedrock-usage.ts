import type { JSONValue, LanguageModelV4Usage } from '@ai-sdk/provider';
import { createNullLanguageModelUsage } from '@ai-sdk/provider-utils';

export type AmazonBedrockUsage = {
  [key: string]: JSONValue | undefined;
  inputTokens: number;
  outputTokens: number;
  totalTokens?: number;
  cacheReadInputTokens?: number | null;
  cacheWriteInputTokens?: number | null;
  cacheDetails?: Array<{
    [key: string]: JSONValue | undefined;
    inputTokens: number;
    ttl: string;
  }> | null;
};

export function convertAmazonBedrockUsage(
  usage: AmazonBedrockUsage | undefined | null,
): LanguageModelV4Usage {
  if (usage == null) {
    return createNullLanguageModelUsage();
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
