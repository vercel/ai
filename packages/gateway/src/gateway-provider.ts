import type { LanguageModelV2, ProviderV2 } from '@ai-sdk/provider';
import { NoSuchModelError } from '@ai-sdk/provider';
import {
  loadOptionalSetting,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import { type FetchFunction } from '@ai-sdk/provider-utils';
import { asGatewayError } from './errors';
import {
  GatewayFetchMetadata,
  type GatewayFetchMetadataResponse,
} from './gateway-fetch-metadata';
import { GatewayLanguageModel } from './gateway-language-model';
import type { GatewayModelId } from './gateway-language-model-settings';
import { getVercelOidcToken, getVercelRequestId } from './vercel-environment';

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

export async function getGatewayAuthToken(options: GatewayProviderSettings) {
  return (
    loadOptionalSetting({
      settingValue: options.apiKey,
      environmentVariableName: 'AI_GATEWAY_API_KEY',
    }) ?? (await getVercelOidcToken())
  );
}

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
    return {
      Authorization: `Bearer ${await getGatewayAuthToken(options)}`,
      'ai-gateway-protocol-version': AI_GATEWAY_PROTOCOL_VERSION,
      ...options.headers,
    };
  };

  const createLanguageModel = (modelId: GatewayModelId) => {
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
    return new GatewayLanguageModel(modelId, {
      provider: 'gateway',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
      o11yHeaders: async () => {
        const requestId = await getVercelRequestId();
        return {
          ...(deploymentId && { 'ai-o11y-deployment-id': deploymentId }),
          ...(environment && { 'ai-o11y-environment': environment }),
          ...(region && { 'ai-o11y-region': region }),
          ...(requestId && { 'ai-o11y-request-id': requestId }),
        };
      },
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
        .catch((error: unknown) => {
          throw asGatewayError(error);
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
  provider.textEmbeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'textEmbeddingModel' });
  };

  return provider;
}

export const gateway = createGatewayProvider();
