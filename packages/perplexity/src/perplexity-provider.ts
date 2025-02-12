import {
  LanguageModelV1,
  NoSuchModelError,
  ProviderV1,
} from '@ai-sdk/provider';
import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import {
  PerplexityChatModelId,
  PerplexityChatSettings,
} from './perplexity-chat-settings';
import { z } from 'zod';
import { ProviderErrorStructure } from '@ai-sdk/openai-compatible';
import { perplexityMetadataExtractor } from './perplexity-metadata-extractor';

// Add error schema and structure
const perplexityErrorSchema = z.object({
  error: z.object({
    code: z.number(),
    message: z.string().nullish(),
    type: z.string().nullish(),
  }),
});

export type PerplexityErrorData = z.infer<typeof perplexityErrorSchema>;

const perplexityErrorStructure: ProviderErrorStructure<PerplexityErrorData> = {
  errorSchema: perplexityErrorSchema,
  errorToMessage: data => data.error.message ?? data.error.type ?? '',
};

export interface PerplexityProvider extends ProviderV1 {
  /**
Creates an Perplexity chat model for text generation.
   */
  (
    modelId: PerplexityChatModelId,
    settings?: PerplexityChatSettings,
  ): LanguageModelV1;

  /**
Creates an Perplexity language model for text generation.
   */
  languageModel(
    modelId: PerplexityChatModelId,
    settings?: PerplexityChatSettings,
  ): LanguageModelV1;

  /**
Creates an Perplexity chat model for text generation.
   */
  chat: (
    modelId: PerplexityChatModelId,
    settings?: PerplexityChatSettings,
  ) => LanguageModelV1;
}

export interface PerplexityProviderSettings {
  /**
Base URL for the perplexity API calls.
     */
  baseURL?: string;

  /**
API key for authenticating requests.
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
}

export function createPerplexity(
  options: PerplexityProviderSettings = {},
): PerplexityProvider {
  const baseURL = withoutTrailingSlash(
    options.baseURL ?? 'https://api.perplexity.ai',
  );
  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'PERPLEXITY_API_KEY',
      description: 'Perplexity',
    })}`,
    ...options.headers,
  });

  const createLanguageModel = (
    modelId: PerplexityChatModelId,
    settings: PerplexityChatSettings = {},
  ) => {
    return new OpenAICompatibleChatLanguageModel(modelId, settings, {
      provider: 'perplexity.chat',
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
      defaultObjectGenerationMode: 'json',
      errorStructure: perplexityErrorStructure,
      metadataExtractor: perplexityMetadataExtractor,
      supportsStructuredOutputs: true,
    });
  };

  const provider = (
    modelId: PerplexityChatModelId,
    settings?: PerplexityChatSettings,
  ) => createLanguageModel(modelId, settings);

  provider.languageModel = createLanguageModel;
  provider.chat = createLanguageModel;
  provider.textEmbeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'textEmbeddingModel' });
  };

  return provider;
}

export const perplexity = createPerplexity();
