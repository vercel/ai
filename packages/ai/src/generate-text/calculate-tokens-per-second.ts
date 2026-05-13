/**
 * Calculates average output tokens per second for the language model response.
 */
export function calculateTokensPerSecond({
  outputTokens,
  responseTimeMs,
}: {
  outputTokens: number | undefined;
  responseTimeMs: number;
}): number {
  return (1000 * (outputTokens ?? 0)) / responseTimeMs;
}
