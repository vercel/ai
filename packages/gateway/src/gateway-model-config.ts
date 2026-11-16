import { LoadAPIKeyError } from '@ai-sdk/provider';
import {
  loadOptionalSetting,
  resolve,
  withoutTrailingSlash,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { GatewayAuthenticationError } from './errors';
import {
  GATEWAY_AUTH_METHOD_HEADER,
  VERCEL_AI_GATEWAY_TEAM_HEADER,
} from './gateway-headers';
import type { GatewayProviderSettings } from './gateway-provider';
import { getVercelOidcToken, getVercelRequestId } from './vercel-environment';
import { VERSION } from './version';

const AI_GATEWAY_PROTOCOL_VERSION = '0.0.1';

/**
 * Shared configuration for Gateway models and API clients.
 *
 * Both `createGateway` and the default model factories build their models from
 * this, so resolving a string model ID only bundles that modality's model.
 */
export function createGatewayModelConfig(options: GatewayProviderSettings) {
  const baseURL =
    withoutTrailingSlash(options.baseURL) ??
    'https://ai-gateway.vercel.sh/v4/ai';

  const createAuthHeaders = (auth: {
    token: string;
    authMethod: 'api-key' | 'oidc';
  }) =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${auth.token}`,
        'ai-gateway-protocol-version': AI_GATEWAY_PROTOCOL_VERSION,
        [GATEWAY_AUTH_METHOD_HEADER]: auth.authMethod,
        ...(options.teamIdOrSlug != null
          ? { [VERCEL_AI_GATEWAY_TEAM_HEADER]: options.teamIdOrSlug }
          : {}),
        ...options.headers,
      },
      `ai-sdk-gateway/${VERSION}`,
    );

  const getAuthToken = async () => {
    try {
      return await getGatewayAuthToken(options);
    } catch (error) {
      throw GatewayAuthenticationError.createContextualError({
        apiKeyProvided: false,
        oidcTokenProvided: false,
        statusCode: 401,
        cause: error,
      });
    }
  };

  const getHeaders = async (
    onResolved?: (headers: Record<string, string | undefined>) => void,
  ) => {
    const headers = createAuthHeaders(await getAuthToken());
    onResolved?.(headers);
    return headers;
  };

  const createO11yHeaders = () => {
    const deploymentId = loadOptionalSetting({
      settingValue: undefined,
      environmentVariableName: 'VERCEL_DEPLOYMENT_ID',
    });
    const environment = loadOptionalSetting({
      settingValue: undefined,
      environmentVariableName: 'VERCEL_ENV',
    });
    const region = loadOptionalSetting({
      settingValue: undefined,
      environmentVariableName: 'VERCEL_REGION',
    });
    const projectId = loadOptionalSetting({
      settingValue: undefined,
      environmentVariableName: 'VERCEL_PROJECT_ID',
    });

    return async () => {
      const requestId = await getVercelRequestId();
      return {
        ...(deploymentId && { 'ai-o11y-deployment-id': deploymentId }),
        ...(environment && { 'ai-o11y-environment': environment }),
        ...(region && { 'ai-o11y-region': region }),
        ...(requestId && { 'ai-o11y-request-id': requestId }),
        ...(projectId && { 'ai-o11y-project-id': projectId }),
      };
    };
  };

  const createModelSettings = () => ({
    provider: 'gateway',
    baseURL,
    headers: getHeaders,
    fetch: options.fetch,
    o11yHeaders: createO11yHeaders(),
  });

  return {
    baseURL,
    createAuthHeaders,
    getAuthToken,
    getHeaders,
    createModelSettings,
  };
}

export type GatewayModelConfig = ReturnType<typeof createGatewayModelConfig>;

/**
 * Resolves the credential for a Gateway request, in this order:
 *
 * 1. The `apiKey` setting (a string, or a callback resolved per request).
 * 2. The `AI_GATEWAY_API_KEY` environment variable.
 * 3. The Vercel OIDC token from `getVercelOidcToken()`. It is available
 *    automatically on Vercel deployments, and locally after `vercel env pull`
 *    or under `vercel dev`.
 *
 * A non-empty configured API key is never replaced by OIDC, even if the key is
 * invalid. An empty string option or environment variable falls through to
 * OIDC; a callback must return a non-empty key. Callers wrap a failure here in a
 * `GatewayAuthenticationError` ("No authentication provided").
 */
export async function getGatewayAuthToken(
  options: GatewayProviderSettings,
): Promise<{ token: string; authMethod: 'api-key' | 'oidc' }> {
  const resolvedApiKey =
    typeof options.apiKey === 'string' || options.apiKey == null
      ? options.apiKey
      : await resolve(options.apiKey);
  if (
    options.apiKey != null &&
    typeof options.apiKey !== 'string' &&
    (typeof resolvedApiKey !== 'string' || !resolvedApiKey.trim())
  ) {
    throw new LoadAPIKeyError({
      message: 'AI Gateway API key must be a non-empty string.',
    });
  }

  const apiKey = loadOptionalSetting({
    settingValue: resolvedApiKey,
    environmentVariableName: 'AI_GATEWAY_API_KEY',
  });

  if (apiKey) {
    return {
      token: apiKey,
      authMethod: 'api-key',
    };
  }

  const oidcToken = await getVercelOidcToken();
  return {
    token: oidcToken,
    authMethod: 'oidc',
  };
}
