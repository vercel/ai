import type { LanguageModelV4Usage } from '@ai-sdk/provider';
import { createNullLanguageModelUsage } from '@ai-sdk/provider-utils';

export type GoogleTokenDetail = {
  modality: string;
  tokenCount: number;
};

export type GoogleUsageMetadata = {
  promptTokenCount?: number | null;
  candidatesTokenCount?: number | null;
  toolUsePromptTokenCount?: number | null;
  totalTokenCount?: number | null;
  cachedContentTokenCount?: number | null;
  thoughtsTokenCount?: number | null;
  trafficType?: string | null;
  serviceTier?: string | null;
  promptTokensDetails?: GoogleTokenDetail[] | null;
  cacheTokensDetails?: GoogleTokenDetail[] | null;
  candidatesTokensDetails?: GoogleTokenDetail[] | null;
  toolUsePromptTokensDetails?: GoogleTokenDetail[] | null;
};

export function convertGoogleUsage(
  usage: GoogleUsageMetadata | undefined | null,
): LanguageModelV4Usage {
  if (usage == null) {
    return createNullLanguageModelUsage();
  }

  const promptTokens = usage.promptTokenCount ?? 0;
  const candidatesTokens = usage.candidatesTokenCount ?? 0;
  const cachedContentTokens = usage.cachedContentTokenCount ?? 0;
  const thoughtsTokens = usage.thoughtsTokenCount ?? 0;

  return {
    inputTokens: {
      total: promptTokens,
      noCache: promptTokens - cachedContentTokens,
      cacheRead: cachedContentTokens,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: candidatesTokens + thoughtsTokens,
      text: candidatesTokens,
      reasoning: thoughtsTokens,
    },
    raw: usage,
  };
}
