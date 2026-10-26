import { LoadSettingError } from '@ai-sdk/provider';
import {
  createJsonResponseHandler,
  lazySchema,
  loadOptionalSetting,
  postToApi,
  withUserAgentSuffix,
  zodSchema,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import type * as nodeFsPromises from 'node:fs/promises';
import { z } from 'zod/v4';
import { anthropicFailedResponseHandler } from './anthropic-error';
import { OAUTH_BETA } from './anthropic-oauth-beta';
import { VERSION } from './version';

const FEDERATION_BETA = 'oidc-federation-2026-04-01';

// Matches the mandatory refresh threshold of the Anthropic SDKs.
const REFRESH_BEFORE_EXPIRY_MS = 30_000;

const anthropicTokenResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      access_token: z.string(),
      expires_in: z.number(),
    }),
  ),
);

export type WorkloadIdentitySettings = {
  federationRuleId: string;
  organizationId: string;
  serviceAccountId: string | undefined;
  workspaceId: string | undefined;
  identityTokenFile: string | undefined;
  identityToken: string | undefined;
};

/**
 * Loads the workload identity federation settings from the same environment
 * variables as the Anthropic SDKs. Returns `undefined` unless the federation
 * rule, organization, and an identity token are set.
 */
export function loadWorkloadIdentitySettings():
  | WorkloadIdentitySettings
  | undefined {
  const loadEnv = (environmentVariableName: string) =>
    loadOptionalSetting({ settingValue: undefined, environmentVariableName }) ||
    undefined;

  const federationRuleId = loadEnv('ANTHROPIC_FEDERATION_RULE_ID');
  const organizationId = loadEnv('ANTHROPIC_ORGANIZATION_ID');
  const identityTokenFile = loadEnv('ANTHROPIC_IDENTITY_TOKEN_FILE');
  const identityToken = loadEnv('ANTHROPIC_IDENTITY_TOKEN');

  if (
    federationRuleId == null ||
    organizationId == null ||
    (identityTokenFile == null && identityToken == null)
  ) {
    return undefined;
  }

  return {
    federationRuleId,
    organizationId,
    serviceAccountId: loadEnv('ANTHROPIC_SERVICE_ACCOUNT_ID'),
    workspaceId: loadEnv('ANTHROPIC_WORKSPACE_ID'),
    identityTokenFile,
    identityToken,
  };
}

/**
 * Returns a function that exchanges the identity token for an Anthropic
 * access token and caches it until shortly before it expires.
 */
export function createWorkloadIdentityTokenCache({
  baseURL,
  fetch,
}: {
  baseURL: string;
  fetch: FetchFunction | undefined;
}): (settings: WorkloadIdentitySettings) => Promise<string> {
  let cachedToken: { token: string; expiresAt: number } | undefined;
  let pendingToken: Promise<{ token: string; expiresAt: number }> | undefined;

  return async settings => {
    if (
      cachedToken == null ||
      cachedToken.expiresAt - Date.now() < REFRESH_BEFORE_EXPIRY_MS
    ) {
      // Concurrent requests share one exchange: identity tokens with a `jti`
      // claim can only be exchanged once.
      pendingToken ??= exchangeIdentityToken({
        settings,
        baseURL,
        fetch,
      }).finally(() => {
        pendingToken = undefined;
      });
      cachedToken = await pendingToken;
    }

    return cachedToken.token;
  };
}

async function exchangeIdentityToken({
  settings,
  baseURL,
  fetch,
}: {
  settings: WorkloadIdentitySettings;
  baseURL: string;
  fetch: FetchFunction | undefined;
}) {
  const body = {
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: await readIdentityToken(settings),
    federation_rule_id: settings.federationRuleId,
    organization_id: settings.organizationId,
    service_account_id: settings.serviceAccountId,
    workspace_id: settings.workspaceId,
  };

  const { value } = await postToApi({
    url: `${baseURL}/oauth/token`,
    headers: withUserAgentSuffix(
      {
        'content-type': 'application/json',
        'anthropic-beta': `${OAUTH_BETA},${FEDERATION_BETA}`,
      },
      `ai-sdk-anthropic/${VERSION}`,
    ),
    // Keep the identity token out of error details.
    body: {
      content: JSON.stringify(body),
      values: { ...body, assertion: undefined },
    },
    failedResponseHandler: anthropicFailedResponseHandler,
    successfulResponseHandler: createJsonResponseHandler(
      anthropicTokenResponseSchema,
    ),
    fetch,
  });

  return {
    token: value.access_token,
    expiresAt: Date.now() + value.expires_in * 1000,
  };
}

async function readIdentityToken({
  identityTokenFile,
  identityToken,
}: WorkloadIdentitySettings): Promise<string | undefined> {
  if (identityTokenFile == null) {
    return identityToken;
  }

  const fs = (
    globalThis.process as
      | { getBuiltinModule?: (id: string) => unknown }
      | undefined
  )?.getBuiltinModule?.('node:fs/promises') as
    | typeof nodeFsPromises
    | undefined;

  if (fs == null) {
    throw new LoadSettingError({
      message:
        'ANTHROPIC_IDENTITY_TOKEN_FILE requires Node.js. ' +
        'Set ANTHROPIC_IDENTITY_TOKEN to pass the identity token directly.',
    });
  }

  // Read on every exchange to pick up rotated tokens, e.g. Kubernetes
  // projected service account tokens.
  return (await fs.readFile(identityTokenFile, 'utf8')).trim();
}
