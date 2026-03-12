import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import {
  LanguageModelV3,
  NoSuchModelError,
  ProviderV3,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  loadOptionalSetting,
  withoutTrailingSlash,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { SarvamChatModelId } from './types';
import { VERSION } from './version';

export interface SarvamProvider extends ProviderV3 {
  (modelId: SarvamChatModelId): LanguageModelV3;

  /**
   * Creates a Sarvam model for text generation.
   */
  languageModel(modelId: SarvamChatModelId): LanguageModelV3;

  /**
   * Creates a Sarvam chat model for text generation.
   */
  chat(modelId: SarvamChatModelId): LanguageModelV3;
}

export interface SarvamProviderSettings {
  /**
   * Base URL for the Sarvam API calls.
   * @default "https://api.sarvam.ai/v1"
   */
  baseURL?: string;

  /**
   * API key for authenticating requests.
   * Can be loaded from SARVAM_API_KEY environment variable.
   */
  apiKey?: string;

  /**
   * Custom headers to include in the requests.
   * Note: Sarvam also supports `api-subscription-key` header for authentication.
   */
  headers?: Record<string, string>;

  /**
   * Custom fetch implementation. You can use it as a middleware to intercept requests,
   * or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;
}

/**
 * Create a Sarvam provider instance.
 *
 * @example
 * ```ts
 * import { createSarvam } from '@ai-sdk/sarvam';
 * import { generateText } from 'ai';
 *
 * const sarvam = createSarvam({
 *   apiKey: process.env.SARVAM_API_KEY,
 * });
 *
 * const result = await generateText({
 *   model: sarvam('sarvam-m'),
 *   prompt: 'Explain quantum computing simply',
 * });
 * ```
 */
export function createSarvam(
  options: SarvamProviderSettings = {},
): SarvamProvider {
  const baseURL =
    withoutTrailingSlash(
      loadOptionalSetting({
        settingValue: options.baseURL,
        environmentVariableName: 'SARVAM_BASE_URL',
      }),
    ) ?? 'https://api.sarvam.ai/v1';

  const getHeaders = () =>
    withUserAgentSuffix(
      {
        'api-subscription-key': loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'SARVAM_API_KEY',
          description: 'Sarvam',
        }),
        ...options.headers,
      },
      `ai-sdk/sarvam/${VERSION}`,
    );

  const createChatModel = (modelId: SarvamChatModelId) =>
    new OpenAICompatibleChatLanguageModel(modelId, {
      provider: 'sarvam.chat',
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
      includeUsage: true,
      supportsStructuredOutputs: false,
    });

  const provider = function (modelId: SarvamChatModelId) {
    return createChatModel(modelId);
  };

  provider.specificationVersion = 'v3' as const;
  provider.languageModel = createChatModel;
  provider.chat = createChatModel;

  provider.embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
  };
  provider.textEmbeddingModel = provider.embeddingModel;
  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };

  return provider as SarvamProvider;
}

/**
 * Default Sarvam provider instance.
 * Uses SARVAM_API_KEY environment variable for authentication.
 */
export const sarvam = createSarvam();
