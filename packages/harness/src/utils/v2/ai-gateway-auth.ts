import { getVercelOidcToken } from '@vercel/oidc';

const DEFAULT_AI_GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh';

/**
 * Resolves the AI Gateway credential and base URL of the current process.
 *
 * `AI_GATEWAY_API_KEY` takes precedence. Otherwise, a configured
 * `VERCEL_OIDC_TOKEN` is resolved through `@vercel/oidc`, which replaces an
 * expired token in the process environment with a valid one when possible.
 * A process can start with an expired token from an env file, so reading
 * the variable directly would depend on whether another library refreshed
 * it earlier.
 */
export async function getAiGatewayAuthFromEnv(): Promise<{
  apiKey: string | undefined;
  baseUrl: string;
}> {
  return {
    apiKey:
      process.env.AI_GATEWAY_API_KEY ||
      (process.env.VERCEL_OIDC_TOKEN ? await getVercelOidcToken() : undefined),
    baseUrl: process.env.AI_GATEWAY_BASE_URL ?? DEFAULT_AI_GATEWAY_BASE_URL,
  };
}
