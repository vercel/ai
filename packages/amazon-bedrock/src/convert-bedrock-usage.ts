<<<<<<< HEAD:packages/amazon-bedrock/src/convert-bedrock-usage.ts
import type { LanguageModelV3Usage } from '@ai-sdk/provider';

export type BedrockUsage = {
=======
import type { JSONValue, LanguageModelV4Usage } from '@ai-sdk/provider';
import { createNullLanguageModelUsage } from '@ai-sdk/provider-utils';

export type AmazonBedrockUsage = {
  [key: string]: JSONValue | undefined;
>>>>>>> fd49828bc4 (fix: preserve complete Amazon Bedrock Converse raw usage objects (#19694)):packages/amazon-bedrock/src/convert-amazon-bedrock-usage.ts
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
