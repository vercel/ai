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
import type { CerebrasChatModelId } from './cerebras-chat-options';
import { z } from 'zod/v4';
import { VERSION } from './version';

// Cerebras returns errors with the standard OpenAI-compatible envelope:
// `{ error: { message, type, code, param, ... } }` (plus a top-level
// `status_code` on server errors). The previous schema expected those fields
// at the top level, which caused any non-2xx response to fall through to
// `TypeValidationError` instead of `APICallError`. The non-`message` fields
// are nullish because Cerebras commonly returns empty strings or omits them
// depending on the error class.
const cerebrasErrorSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string().nullish(),
    param: z.any().nullish(),
    code: z.union([z.string(), z.number()]).nullish(),
  }),
});

export type CerebrasErrorData = z.infer<typeof cerebrasErrorSchema>;

const cerebrasErrorStructure: ProviderErrorStructure<CerebrasErrorData> = {
  errorSchema: cerebrasErrorSchema,
  errorToMessage: data => data.error.message,
};

export interface CerebrasProviderSettings {
  /**
   * Cerebras API key.
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

export interface CerebrasProvider extends ProviderV4 {
  /**
   * Creates a Cerebras model for text generation.
   */
  (modelId: CerebrasChatModelId): LanguageModelV4;

  /**
   * Creates a Cerebras model for text generation.
   */
  languageModel(modelId: CerebrasChatModelId): LanguageModelV4;

  /**
   * Creates a Cerebras chat model for text generation.
   */
  chat(modelId: CerebrasChatModelId): LanguageModelV4;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: string): never;
}

export function createCerebras(
  options: CerebrasProviderSettings = {},
): CerebrasProvider {
  const baseURL = withoutTrailingSlash(
    options.baseURL ?? 'https://api.cerebras.ai/v1',
  );
  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'CEREBRAS_API_KEY',
          description: 'Cerebras API key',
        })}`,
        ...options.headers,
      },
      `ai-sdk/cerebras/${VERSION}`,
    );

  const createLanguageModel = (modelId: CerebrasChatModelId) => {
    return new OpenAICompatibleChatLanguageModel(modelId, {
      provider: `cerebras.chat`,
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
      errorStructure: cerebrasErrorStructure,
      supportsStructuredOutputs: true,
    });
  };

  const provider = (modelId: CerebrasChatModelId) =>
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

export const cerebras = createCerebras();
