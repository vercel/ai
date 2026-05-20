import type { LanguageModelV3Usage } from '@ai-sdk/provider';

export type GoogleGenerativeAITokenDetail = {
  modality: string;
  tokenCount: number;
};

export type GoogleGenerativeAIUsageMetadata = {
  promptTokenCount?: number | null;
  candidatesTokenCount?: number | null;
  totalTokenCount?: number | null;
  cachedContentTokenCount?: number | null;
  thoughtsTokenCount?: number | null;
  trafficType?: string | null;
<<<<<<< HEAD:packages/google/src/convert-google-generative-ai-usage.ts
  promptTokensDetails?: GoogleGenerativeAITokenDetail[] | null;
  candidatesTokensDetails?: GoogleGenerativeAITokenDetail[] | null;
=======
  serviceTier?: string | null;
  promptTokensDetails?: GoogleTokenDetail[] | null;
  candidatesTokensDetails?: GoogleTokenDetail[] | null;
>>>>>>> 045d2e8ee (fix(google): read serviceTier from usageMetadata in stream + generate (#15488)):packages/google/src/convert-google-usage.ts
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
