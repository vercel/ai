import {
  type EmbeddingModelV2,
  type LanguageModelV2,
  NoSuchModelError,
  type ProviderV2,
} from '@ai-sdk/provider';
import {
  type FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { AlibabaLanguageModel } from './alibaba-chat-language-model';
import type { AlibabaChatModelId } from './alibaba-chat-options';
import {
  type AlibabaErrorData,
  alibabaFailedResponseHandler,
} from './alibaba-error';
import { AlibabaEmbeddingModel } from './alibaba-embedding-model';
import type { AlibabaEmbeddingModelId } from './alibaba-embedding-options';
import { VERSION } from './version';

export type { AlibabaErrorData };
export { alibabaFailedResponseHandler };

export interface AlibabaProvider extends ProviderV2 {
  (modelId: AlibabaChatModelId): LanguageModelV2;

  /**
   * Creates a model for text generation.
   */
  languageModel(modelId: AlibabaChatModelId): LanguageModelV2;

  /**
   * Creates a chat model for text generation.
   */
  chatModel(modelId: AlibabaChatModelId): LanguageModelV2;

  /**
   * Creates a model for text embeddings.
   */
  embedding(modelId: AlibabaEmbeddingModelId): EmbeddingModelV2<string>;

  /**
   * Creates a model for text embeddings.
   */
  textEmbedding(modelId: AlibabaEmbeddingModelId): EmbeddingModelV2<string>;

  /**
   * Creates a model for text embeddings.
   */
  textEmbeddingModel(
    modelId: AlibabaEmbeddingModelId,
  ): EmbeddingModelV2<string>;
}

export interface AlibabaProviderSettings {
  /**
   * Use a different URL prefix for API calls, e.g. to use proxy servers or regional endpoints.
   * The default prefix is `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`.
   */
  baseURL?: string;

  /**
   * Use a different URL prefix for embedding API calls.
   * The embedding API uses the DashScope native endpoint (not the OpenAI-compatible endpoint).
   * The default prefix is `https://dashscope-intl.aliyuncs.com/api/v1`.
   */
  embeddingBaseURL?: string;

  /**
   * API key that is being sent using the `Authorization` header.
   * It defaults to the `ALIBABA_API_KEY` environment variable.
   */
  apiKey?: string;

  /**
   * Custom headers to include in the requests.
   */
  headers?: Record<string, string>;

  /**
   * Custom fetch implementation. You can use it as a middleware to intercept requests,
   * or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;

  /**
   * Include usage information in streaming responses.
   * When enabled, token usage will be included in the final chunk.
   *
   * @default true
   */
  includeUsage?: boolean;
}

/**
 * Create an Alibaba Cloud (Qwen) provider instance.
 */
export function createAlibaba(
  options: AlibabaProviderSettings = {},
): AlibabaProvider {
  const baseURL =
    withoutTrailingSlash(options.baseURL) ??
    'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

  const embeddingBaseURL =
    withoutTrailingSlash(options.embeddingBaseURL) ??
    'https://dashscope-intl.aliyuncs.com/api/v1';

  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'ALIBABA_API_KEY',
          description: 'Alibaba Cloud (DashScope)',
        })}`,
        ...options.headers,
      },
      `ai-sdk/alibaba/${VERSION}`,
    );

  const createLanguageModel = (modelId: AlibabaChatModelId) =>
    new AlibabaLanguageModel(modelId, {
      provider: 'alibaba.chat',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
      includeUsage: options.includeUsage ?? true,
    });

  const createEmbeddingModel = (modelId: AlibabaEmbeddingModelId) =>
    new AlibabaEmbeddingModel(modelId, {
      provider: 'alibaba.embedding',
      baseURL: embeddingBaseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = function (modelId: AlibabaChatModelId) {
    if (new.target) {
      throw new Error(
        'The Alibaba model function cannot be called with the new keyword.',
      );
    }

    return createLanguageModel(modelId);
  };

  provider.specificationVersion = 'v2' as const;
  provider.languageModel = createLanguageModel;
  provider.chatModel = createLanguageModel;
  provider.embedding = createEmbeddingModel;
  provider.textEmbedding = createEmbeddingModel;
  provider.textEmbeddingModel = createEmbeddingModel;

  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };

  return provider;
}

export const alibaba = createAlibaba();
