import { NoSuchModelError } from '@ai-sdk/provider';
import {
  loadOptionalSetting,
  withoutTrailingSlash,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { asGatewayError, GatewayAuthenticationError } from './errors';
import {
  GATEWAY_AUTH_METHOD_HEADER,
  parseAuthMethod,
} from './errors/parse-auth-method';
import {
  GatewayFetchMetadata,
  type GatewayFetchMetadataResponse,
} from './gateway-fetch-metadata';
import { GatewayLanguageModel } from './gateway-language-model';
import { GatewayEmbeddingModel } from './gateway-embedding-model';
import type { GatewayEmbeddingModelId } from './gateway-embedding-model-settings';
import { getVercelOidcToken, getVercelRequestId } from './vercel-environment';
import type { GatewayModelId } from './gateway-language-model-settings';
import type {
  LanguageModelV2,
  EmbeddingModelV2,
  ProviderV2,
} from '@ai-sdk/provider';

export interface GatewayProvider extends ProviderV2 {
  (modelId: GatewayModelId): LanguageModelV2;

  /**
Creates a model for text generation.
*/
  languageModel(modelId: GatewayModelId): LanguageModelV2;

  /**
Returns available providers and models for use with the remote provider.
 */
  getAvailableModels(): Promise<GatewayFetchMetadataResponse>;

  /**
Creates a model for generating text embeddings.
*/
  textEmbeddingModel(
    modelId: GatewayEmbeddingModelId,
  ): EmbeddingModelV2<string>;
}

export interface GatewayProviderSettings {
  /**
The base URL prefix for API calls. Defaults to `https://ai-gateway.vercel.sh/v1/ai`.
   */
  baseURL?: string;

  /**
API key that is being sent using the `Authorization` header.
   */
  apiKey?: string;

  /**
Custom headers to include in the requests.
     */
  headers?: Record<string, string>;

  /**
Custom fetch implementation. You can use it as a middleware to intercept requests,
or to provide a custom fetch implementation for e.g. testing.
    */
  fetch?: FetchFunction;

  /**
How frequently to refresh the metadata cache in milliseconds.
   */
  metadataCacheRefreshMillis?: number;

  /**
   * @internal For testing purposes only
   */
  _internal?: {
    currentDate?: () => Date;
  };
}

const AI_GATEWAY_PROTOCOL_VERSION = '0.0.1';

/**
Create a remote provider instance.
 */
export function createGatewayProvider(
  options: GatewayProviderSettings = {},
): GatewayProvider {
  let pendingMetadata: Promise<GatewayFetchMetadataResponse> | null = null;
  let metadataCache: GatewayFetchMetadataResponse | null = null;
  const cacheRefreshMillis =
    options.metadataCacheRefreshMillis ?? 1000 * 60 * 5;
  let lastFetchTime = 0;

  const baseURL =
    withoutTrailingSlash(options.baseURL) ??
    'https://ai-gateway.vercel.sh/v1/ai';

  const getHeaders = async () => {
    const auth = await getGatewayAuthToken(options);
    if (auth) {
      return {
        Authorization: `Bearer ${auth.token}`,
        'ai-gateway-protocol-version': AI_GATEWAY_PROTOCOL_VERSION,
        [GATEWAY_AUTH_METHOD_HEADER]: auth.authMethod,
        ...options.headers,
      };
    }

    throw GatewayAuthenticationError.createContextualError({
      apiKeyProvided: false,
      oidcTokenProvided: false,
      statusCode: 401,
    });
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

    return async () => {
      const requestId = await getVercelRequestId();
      return {
        ...(deploymentId && { 'ai-o11y-deployment-id': deploymentId }),
        ...(environment && { 'ai-o11y-environment': environment }),
        ...(region && { 'ai-o11y-region': region }),
        ...(requestId && { 'ai-o11y-request-id': requestId }),
      };
    };
  };

  const createLanguageModel = (modelId: GatewayModelId) => {
    return new GatewayLanguageModel(modelId, {
      provider: 'gateway',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
      o11yHeaders: createO11yHeaders(),
    });
  };

  const getAvailableModels = async () => {
    const now = options._internal?.currentDate?.().getTime() ?? Date.now();
    if (!pendingMetadata || now - lastFetchTime > cacheRefreshMillis) {
      lastFetchTime = now;

      pendingMetadata = new GatewayFetchMetadata({
        baseURL,
        headers: getHeaders,
        fetch: options.fetch,
      })
        .getAvailableModels()
        .then(metadata => {
          metadataCache = metadata;
          return metadata;
        })
        .catch(async (error: unknown) => {
          throw asGatewayError(error, parseAuthMethod(await getHeaders()));
        });
    }

    return metadataCache ? Promise.resolve(metadataCache) : pendingMetadata;
  };

  const provider = function (modelId: GatewayModelId) {
    if (new.target) {
      throw new Error(
        'The Gateway Provider model function cannot be called with the new keyword.',
      );
    }

    return createLanguageModel(modelId);
  };

  provider.getAvailableModels = getAvailableModels;
  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };
  provider.languageModel = createLanguageModel;
  provider.textEmbeddingModel = (modelId: GatewayEmbeddingModelId) => {
    return new GatewayEmbeddingModel(modelId, {
      provider: 'gateway',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
      o11yHeaders: createO11yHeaders(),
    });
  };

  return provider;
}

export const gateway = createGatewayProvider();

export async function getGatewayAuthToken(
  options: GatewayProviderSettings,
): Promise<{
  token: string;
  authMethod: 'api-key' | 'oidc';
} | null> {
  const apiKey = loadOptionalSetting({
    settingValue: options.apiKey,
    environmentVariableName: 'AI_GATEWAY_API_KEY',
  });

  if (apiKey) {
    return {
      token: apiKey,
      authMethod: 'api-key',
    };
  }

  try {
    const oidcToken = await getVercelOidcToken();
    return {
      token: oidcToken,
      authMethod: 'oidc',
    };
  } catch {
    return null;
  }
}
