import { normalizeHeaders } from '@ai-sdk/provider-utils';

/** Beta required on requests authenticated with an OAuth access token. */
export const OAUTH_BETA = 'oauth-2025-04-20';

function hasOAuthBeta(betas: string | undefined): boolean {
  return betas?.split(',').some(beta => beta.trim() === OAUTH_BETA) ?? false;
}

/** Appends the OAuth beta to the `anthropic-beta` header. */
export function appendOAuthBeta(
  headers: Record<string, string | undefined>,
): Record<string, string> {
  const result = normalizeHeaders(headers);

  if (!hasOAuthBeta(result['anthropic-beta'])) {
    result['anthropic-beta'] = [result['anthropic-beta'], OAUTH_BETA]
      .filter(Boolean)
      .join(',');
  }

  return result;
}

/**
 * Keeps the OAuth beta from the provider headers after endpoint or per-call
 * headers replaced the `anthropic-beta` header.
 */
export function withOAuthBeta(
  providerHeaders: Record<string, string | undefined> | undefined,
  headers: Record<string, string | undefined>,
): Record<string, string | undefined> {
  return hasOAuthBeta(normalizeHeaders(providerHeaders)['anthropic-beta'])
    ? appendOAuthBeta(headers)
    : headers;
}
