import { LanguageModelV4Usage } from '@ai-sdk/provider';

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
  toolUsePromptTokenCount?: number | null;
  trafficType?: string | null;
  promptTokensDetails?: GoogleGenerativeAITokenDetail[] | null;
  candidatesTokensDetails?: GoogleGenerativeAITokenDetail[] | null;
};

export function convertGoogleGenerativeAIUsage(
  usage: GoogleGenerativeAIUsageMetadata | undefined | null,
): LanguageModelV4Usage {
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
  // Tokens consumed by tool-use prompts (e.g. grounded search, URL context).
  // Google bills these at the regular input rate but reports them as a
  // separate field. Including them in `inputTokens.total` ensures consumers
  // that compute cost from the standard usage shape match Google's billing.
  // See https://ai.google.dev/api/generate-content#UsageMetadata.
  const toolUsePromptTokens = usage.toolUsePromptTokenCount ?? 0;
  const totalInputTokens = promptTokens + toolUsePromptTokens;

  return {
    inputTokens: {
      total: totalInputTokens,
      noCache: totalInputTokens - cachedContentTokens,
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
