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
  const toolUsePromptTokens = usage.toolUsePromptTokenCount ?? 0;
  const cachedContentTokens = usage.cachedContentTokenCount ?? 0;
  const thoughtsTokens = usage.thoughtsTokenCount ?? 0;
  const inputTokens = promptTokens + toolUsePromptTokens;

  return {
    inputTokens: {
      total: inputTokens,
      noCache: inputTokens - cachedContentTokens,
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

/**
 * Sums the usage metadata of two requests, e.g. the hops of a long decode
 * response that was continued automatically. Non-numeric fields are taken
 * from the later request.
 */
export function addGoogleUsageMetadata<T extends GoogleUsageMetadata>(
  a: T | undefined,
  b: T | undefined,
): T | undefined {
  if (a == null || b == null) {
    return b ?? a;
  }

  return {
    ...a,
    ...b,
    promptTokenCount: addCounts(a.promptTokenCount, b.promptTokenCount),
    candidatesTokenCount: addCounts(
      a.candidatesTokenCount,
      b.candidatesTokenCount,
    ),
    toolUsePromptTokenCount: addCounts(
      a.toolUsePromptTokenCount,
      b.toolUsePromptTokenCount,
    ),
    totalTokenCount: addCounts(a.totalTokenCount, b.totalTokenCount),
    cachedContentTokenCount: addCounts(
      a.cachedContentTokenCount,
      b.cachedContentTokenCount,
    ),
    thoughtsTokenCount: addCounts(a.thoughtsTokenCount, b.thoughtsTokenCount),
    promptTokensDetails: addTokenDetails(
      a.promptTokensDetails,
      b.promptTokensDetails,
    ),
    cacheTokensDetails: addTokenDetails(
      a.cacheTokensDetails,
      b.cacheTokensDetails,
    ),
    candidatesTokensDetails: addTokenDetails(
      a.candidatesTokensDetails,
      b.candidatesTokensDetails,
    ),
    toolUsePromptTokensDetails: addTokenDetails(
      a.toolUsePromptTokensDetails,
      b.toolUsePromptTokensDetails,
    ),
  };
}

function addCounts(
  a: number | null | undefined,
  b: number | null | undefined,
): number | null | undefined {
  return a == null && b == null ? (b ?? a) : (a ?? 0) + (b ?? 0);
}

function addTokenDetails(
  a: GoogleTokenDetail[] | null | undefined,
  b: GoogleTokenDetail[] | null | undefined,
): GoogleTokenDetail[] | null | undefined {
  if (a == null || b == null) {
    return b ?? a;
  }

  const tokenCounts = new Map<string, number>();
  for (const { modality, tokenCount } of [...a, ...b]) {
    tokenCounts.set(modality, (tokenCounts.get(modality) ?? 0) + tokenCount);
  }

  return Array.from(tokenCounts, ([modality, tokenCount]) => ({
    modality,
    tokenCount,
  }));
}
