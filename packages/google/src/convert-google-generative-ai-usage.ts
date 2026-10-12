import type { LanguageModelV3Usage } from '@ai-sdk/provider';

export type GoogleGenerativeAITokenDetail = {
  modality: string;
  tokenCount: number;
};

export type GoogleGenerativeAIUsageMetadata = {
  promptTokenCount?: number | null;
  candidatesTokenCount?: number | null;
  toolUsePromptTokenCount?: number | null;
  totalTokenCount?: number | null;
  cachedContentTokenCount?: number | null;
  thoughtsTokenCount?: number | null;
  trafficType?: string | null;
  serviceTier?: string | null;
  promptTokensDetails?: GoogleGenerativeAITokenDetail[] | null;
  cacheTokensDetails?: GoogleGenerativeAITokenDetail[] | null;
  candidatesTokensDetails?: GoogleGenerativeAITokenDetail[] | null;
  toolUsePromptTokensDetails?: GoogleGenerativeAITokenDetail[] | null;
};

export function convertGoogleGenerativeAIUsage(
  usage: GoogleGenerativeAIUsageMetadata | undefined | null,
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

/**
 * Sums the usage metadata of two requests, e.g. the hops of a long decode
 * response that was continued automatically. Non-numeric fields are taken
 * from the later request.
 */
export function addGoogleGenerativeAIUsageMetadata<
  T extends GoogleGenerativeAIUsageMetadata,
>(a: T | undefined, b: T | undefined): T | undefined {
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
  a: GoogleGenerativeAITokenDetail[] | null | undefined,
  b: GoogleGenerativeAITokenDetail[] | null | undefined,
): GoogleGenerativeAITokenDetail[] | null | undefined {
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
