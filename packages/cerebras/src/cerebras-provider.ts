import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import {
  LanguageModelV2,
  NoSuchModelError,
  ProviderV2,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import { CerebrasChatModelId } from './cerebras-chat-options';
import { z } from 'zod/v4';
import { ProviderErrorStructure } from '@ai-sdk/openai-compatible';

// Add error schema and structure
const cerebrasErrorSchema = z.object({
  message: z.string(),
  type: z.string(),
  param: z.string(),
  code: z.string(),
});

export type CerebrasErrorData = z.infer<typeof cerebrasErrorSchema>;

const cerebrasErrorStructure: ProviderErrorStructure<CerebrasErrorData> = {
  errorSchema: cerebrasErrorSchema,
  errorToMessage: data => data.message,
};

export interface CerebrasProviderSettings {
  /**
Cerebras API key.
*/
  apiKey?: string;
  /**
Base URL for the API calls.
*/
  baseURL?: string;
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

export interface CerebrasProvider extends ProviderV2 {
  /**
Creates a Cerebras model for text generation.
*/
  (modelId: CerebrasChatModelId): LanguageModelV2;

  /**
Creates a Cerebras model for text generation.
*/
  languageModel(modelId: CerebrasChatModelId): LanguageModelV2;

  /**
Creates a Cerebras chat model for text generation.
*/
  chat(modelId: CerebrasChatModelId): LanguageModelV2;
}

export function createCerebras(
  options: CerebrasProviderSettings = {},
): CerebrasProvider {
  const baseURL = withoutTrailingSlash(
    options.baseURL ?? 'https://api.cerebras.ai/v1',
  );
  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'CEREBRAS_API_KEY',
      description: 'Cerebras API key',
    })}`,
    ...options.headers,
  });

  const createLanguageModel = (modelId: CerebrasChatModelId) => {
    return new OpenAICompatibleChatLanguageModel(modelId, {
      provider: `cerebras.chat`,
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
      errorStructure: cerebrasErrorStructure,
    });
  };

  const provider = (modelId: CerebrasChatModelId) =>
    createLanguageModel(modelId);

  provider.languageModel = createLanguageModel;
  provider.chat = createLanguageModel;

  provider.textEmbeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'textEmbeddingModel' });
  };
  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };

  return provider;
}

export const cerebras = createCerebras();
