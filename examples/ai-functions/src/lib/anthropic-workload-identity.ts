import { createAnthropic } from '@ai-sdk/anthropic';
import { identityTokenFromFile } from '@anthropic-ai/sdk/lib/credentials/identity-token';
import { oidcFederationProvider } from '@anthropic-ai/sdk/lib/credentials/oidc-federation';
import { TokenCache } from '@anthropic-ai/sdk/lib/credentials/token-cache';
import { requireEnv } from './require-env';

export function createWorkloadIdentityAnthropic() {
  const tokenCache = new TokenCache(
    oidcFederationProvider({
      // The workload's identity provider must keep this file supplied with fresh JWTs.
      identityTokenProvider: identityTokenFromFile(
        requireEnv('ANTHROPIC_IDENTITY_TOKEN_FILE'),
      ),
      federationRuleId: requireEnv('ANTHROPIC_FEDERATION_RULE_ID'),
      organizationId: requireEnv('ANTHROPIC_ORGANIZATION_ID'),
      serviceAccountId: requireEnv('ANTHROPIC_SERVICE_ACCOUNT_ID'),
      workspaceId: process.env.ANTHROPIC_WORKSPACE_ID,
      baseURL: 'https://api.anthropic.com',
      fetch: globalThis.fetch,
    }),
  );

  return createAnthropic({
    authToken: () => tokenCache.getToken(),
    headers: { 'anthropic-beta': 'oauth-2025-04-20' },
  });
}
