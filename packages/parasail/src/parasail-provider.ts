import {
  OpenAICompatibleChatLanguageModel,
  type ProviderErrorStructure,
} from '@ai-sdk/openai-compatible';
import {
  NoSuchModelError,
  type LanguageModelV4,
  type ProviderV4,
} from '@ai-sdk/provider';
import {
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { ParasailChatModelId } from './parasail-chat-options';
import { VERSION } from './version';

const parasailErrorSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string().nullish(),
    code: z.string().nullish(),
  }),
});

export type ParasailErrorData = z.infer<typeof parasailErrorSchema>;

const parasailErrorStructure: ProviderErrorStructure<ParasailErrorData> = {
  errorSchema: parasailErrorSchema,
  errorToMessage: data => data.error.message,
};

export interface ParasailProviderSettings {
  /**
   * Parasail API key. Defaults to the `PARASAIL_API_KEY` environment variable.
   */
  apiKey?: string;
  /**
   * Base URL for the API calls.
   */
  baseURL?: string;
  /**
   * Custom headers to include in the requests.
   */
  headers?: Record<string, string>;
  /**
   * Custom fetch implementation. You can use it as a middleware to intercept requests,
   * or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;
}

export interface ParasailProvider extends ProviderV4 {
  /**
   * Creates a Parasail model for text generation.
   */
  (modelId: ParasailChatModelId): LanguageModelV4;

  /**
   * Creates a Parasail model for text generation.
   */
  languageModel(modelId: ParasailChatModelId): LanguageModelV4;

  /**
   * Creates a Parasail chat model for text generation.
   */
  chat(modelId: ParasailChatModelId): LanguageModelV4;
}

export function createParasail(
  options: ParasailProviderSettings = {},
): ParasailProvider {
  const baseURL = withoutTrailingSlash(
    options.baseURL ?? 'https://api.parasail.io/v1',
  );
  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'PARASAIL_API_KEY',
          description: 'Parasail API key',
        })}`,
        ...options.headers,
      },
      `ai-sdk/parasail/${VERSION}`,
    );

  const createLanguageModel = (modelId: ParasailChatModelId) =>
    new OpenAICompatibleChatLanguageModel(modelId, {
      provider: 'parasail.chat',
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
      errorStructure: parasailErrorStructure,
      supportsStructuredOutputs: true,
    });

  const provider = (modelId: ParasailChatModelId) =>
    createLanguageModel(modelId);

  provider.specificationVersion = 'v4' as const;
  provider.languageModel = createLanguageModel;
  provider.chat = createLanguageModel;

  provider.embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
  };
  provider.textEmbeddingModel = provider.embeddingModel;
  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };

  return provider;
}

export const parasail = createParasail();
