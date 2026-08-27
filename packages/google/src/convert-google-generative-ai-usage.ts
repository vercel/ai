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
<<<<<<< HEAD:packages/google/src/convert-google-generative-ai-usage.ts
  promptTokensDetails?: GoogleGenerativeAITokenDetail[] | null;
  candidatesTokensDetails?: GoogleGenerativeAITokenDetail[] | null;
=======
  promptTokensDetails?: GoogleTokenDetail[] | null;
  cacheTokensDetails?: GoogleTokenDetail[] | null;
  candidatesTokensDetails?: GoogleTokenDetail[] | null;
  toolUsePromptTokensDetails?: GoogleTokenDetail[] | null;
>>>>>>> 3ad9da96a3 (fix: preserve complete Google Generative Language raw usage metadata (#19827)):packages/google/src/convert-google-usage.ts
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
