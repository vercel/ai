type TokenDetail = {
  modality: string;
  tokenCount: number;
};

type UsageMetadata = {
  promptTokenCount?: number | null;
  candidatesTokenCount?: number | null;
  totalTokenCount?: number | null;
  cachedContentTokenCount?: number | null;
  thoughtsTokenCount?: number | null;
  promptTokensDetails?: TokenDetail[] | null;
  candidatesTokensDetails?: TokenDetail[] | null;
};

/**
 * Sums the usage metadata of two requests, e.g. the requests of a long decode
 * response that was continued automatically. Non-numeric fields are taken
 * from the later request.
 */
export function addGoogleGenerativeAIUsageMetadata<T extends UsageMetadata>(
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
    candidatesTokensDetails: addTokenDetails(
      a.candidatesTokensDetails,
      b.candidatesTokensDetails,
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
  a: TokenDetail[] | null | undefined,
  b: TokenDetail[] | null | undefined,
): TokenDetail[] | null | undefined {
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
