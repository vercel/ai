/**
 * Resolves the total/uncached split of a provider's input token count.
 *
 * Providers disagree about whether the input-token count they report already
 * includes cached tokens. Most include them, so the uncached remainder is
 * `reported - cached`. Some report the uncached count directly, and for those
 * the subtraction underflows.
 *
 * A cache breakdown larger than the reported total is the proof of which
 * convention is in play: it can only happen when the reported value already
 * *is* the uncached count, in which case the true total is the sum.
 *
 * Without this inference `noCache` goes negative whenever a cache-exclusive
 * provider serves a request whose cached prefix exceeds the fresh remainder —
 * routine in agentic traffic, where a long cached context is replayed against
 * a handful of new tokens — and consumers downstream bill and report on it.
 *
 * @param reportedInputTokens - The provider's reported input/prompt token count.
 * @param cachedTokens - Tokens attributable to the cache (reads plus writes).
 * Whether the provider counted these inside `reportedInputTokens` is inferred
 * rather than assumed.
 *
 * @returns Non-negative `total` and `noCache` counts.
 */
export function resolveInputTokenUsage({
  reportedInputTokens,
  cachedTokens,
}: {
  reportedInputTokens: number;
  cachedTokens: number;
}): { total: number; noCache: number } {
  // Normalize up front so both outputs are non-negative by construction; a
  // provider reporting a negative count is a separate defect and must not
  // become a negative token count downstream.
  const reported = Math.max(0, reportedInputTokens);
  const cached = Math.max(0, cachedTokens);

  const reportedIncludesCached = cached <= reported;

  return {
    total: reportedIncludesCached ? reported : reported + cached,
    noCache: reportedIncludesCached ? reported - cached : reported,
  };
}
