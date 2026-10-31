import type { LanguageModelV4Usage } from '@ai-sdk/provider';
import { createNullLanguageModelUsage } from '@ai-sdk/provider-utils';
import type { DeepSeekResponsesUsage } from './deepseek-responses-api';

export function convertDeepSeekResponsesUsage(
  usage: DeepSeekResponsesUsage | null | undefined,
): LanguageModelV4Usage {
  if (usage == null) {
    return createNullLanguageModelUsage();
  }

  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const cacheReadTokens = usage.input_tokens_details?.cached_tokens ?? 0;
  const reasoningTokens = usage.output_tokens_details?.reasoning_tokens ?? 0;

  return {
    inputTokens: {
      total: inputTokens,
      noCache: inputTokens - cacheReadTokens,
      cacheRead: cacheReadTokens,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: outputTokens,
      text: Math.max(0, outputTokens - reasoningTokens),
      reasoning: reasoningTokens,
    },
    raw: usage,
  };
}

export function getDeepSeekServerToolUse(
  usage: DeepSeekResponsesUsage | null | undefined,
): { toolSearch: number; toolFetch: number } | undefined {
  const serverToolUse = usage?.server_tool_use;
  if (serverToolUse == null) {
    return undefined;
  }
  return {
    toolSearch: serverToolUse.tool_search ?? 0,
    toolFetch: serverToolUse.tool_fetch ?? 0,
  };
}
