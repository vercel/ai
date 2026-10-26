/** Beta required on requests authenticated with an OAuth access token. */
export const OAUTH_BETA = 'oauth-2025-04-20';

/**
 * Joins `betas` into an `anthropic-beta` header value. Endpoints that set
 * their own betas use this to keep the OAuth beta from the provider headers.
 */
export function joinBetasWithOAuthBeta(
  providerHeaders: Record<string, string | undefined>,
  betas: Iterable<string>,
): string | undefined {
  const result = new Set(betas);

  if (
    providerHeaders['anthropic-beta']
      ?.split(',')
      .some(beta => beta.trim() === OAUTH_BETA)
  ) {
    result.add(OAUTH_BETA);
  }

  return result.size > 0 ? Array.from(result).join(',') : undefined;
}
