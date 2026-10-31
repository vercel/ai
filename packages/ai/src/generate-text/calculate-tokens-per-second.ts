/**
 * Calculates a token rate in tokens per second.
 *
 * Returns 0 when the token count is unknown, the duration is unknown or 0, or
 * the computed rate cannot be represented as a finite JSON-safe number.
 */
export function calculateTokensPerSecond({
  tokens,
  durationMs,
}: {
  tokens: number | undefined;
  durationMs: number | undefined;
}): number {
  if (tokens == null || durationMs == null || tokens <= 0 || durationMs <= 0) {
    return 0;
  }

  const tokenRate = (1000 * tokens) / durationMs;

  return Number.isFinite(tokenRate) ? tokenRate : 0;
}
