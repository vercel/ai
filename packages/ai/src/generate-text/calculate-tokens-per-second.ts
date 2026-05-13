/**
 * Calculates average output tokens per second for the language model response.
 *
 * Returns 0 when the metric cannot be represented as a finite number, for
 * example when the response time is 0. This keeps performance data JSON-safe
 * for result objects and telemetry backends.
 */
export function calculateTokensPerSecond({
  outputTokens,
  responseTimeMs,
}: {
  outputTokens: number | undefined;
  responseTimeMs: number;
}): number {
  const tokensPerSecond = (1000 * (outputTokens ?? 0)) / responseTimeMs;

  return Number.isFinite(tokensPerSecond) ? tokensPerSecond : 0;
}
