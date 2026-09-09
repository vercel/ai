import {
  OpenAICompatibleChatLanguageModel,
  OpenAICompatibleEmbeddingModel,
  type ProviderErrorStructure,
} from '@ai-sdk/openai-compatible';
import {
  NoSuchModelError,
  type EmbeddingModelV4,
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
import type { BasetenChatModelId } from './baseten-chat-options';
import type { BasetenEmbeddingModelId } from './baseten-embedding-options';
import { VERSION } from './version';

/**
 * Baseten's per-request embedding input limit: larger batches are rejected with
 * `413 batch size N > maximum allowed batch size 128`. It is also the native
 * performance client's own default `batchSize`. `embedMany` splits larger
 * inputs into chunks of this size and runs them in parallel.
 */
const MAX_EMBEDDINGS_PER_CALL = 128;

/**
 * The part of `@basetenlabs/performance-client` we use, declared structurally to
 * keep that native addon out of our dependency and type graph.
 */
export type BasetenPerformanceClient = {
  embed(
    input: string[],
    model: string,
  ): Promise<{
    data: { embedding: number[] }[];
    usage?: { total_tokens?: number };
  }>;
};

export type BasetenPerformanceClientConstructor = new (
  baseUrl: string,
  apiKey?: string,
) => BasetenPerformanceClient;

export type BasetenErrorData = z.infer<typeof basetenErrorSchema>;

// Baseten returns two different envelopes. The Model APIs send a bare string
// (`{"error":"please check the model you provided"}`), while dedicated
// deployments pass through their server's OpenAI-shaped object. Parsing only
// the string form left dedicated-deployment errors falling back to the HTTP
// reason phrase — "Not Found", or nothing at all over HTTP/2.
const basetenErrorSchema = z.object({
  error: z.union([
    z.string(),
    z.object({
      message: z.string(),
      object: z.string().nullish(),
      type: z.string().nullish(),
      param: z.any().nullish(),
      code: z.union([z.string(), z.number()]).nullish(),
    }),
  ]),
});

const basetenErrorStructure: ProviderErrorStructure<BasetenErrorData> = {
  errorSchema: basetenErrorSchema,
  errorToMessage: data =>
    typeof data.error === 'string' ? data.error : data.error.message,
};

export interface BasetenProviderSettings {
  /**
   * Baseten API key. Default value is taken from the `BASETEN_API_KEY`
   * environment variable.
   */
  apiKey?: string;

  /**
   * Base URL for the Model APIs. Default: 'https://inference.baseten.co/v1'
   */
  baseURL?: string;

  /**
   * Model URL for custom models (chat or embeddings).
   * If not supplied, the default Model APIs will be used.
   */
  modelURL?: string;
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
   * Opt in to Baseten's native performance client for embeddings, for
   * client-side batching and request hedging. Pass the `PerformanceClient`
   * constructor from `@basetenlabs/performance-client`, which you install
   * yourself:
   *
   * ```ts
   * import { PerformanceClient } from '@basetenlabs/performance-client';
   *
   * const baseten = createBaseten({ modelURL, performanceClient: PerformanceClient });
   * ```
   *
   * When omitted, embeddings go over plain HTTP to Baseten's OpenAI-compatible
   * endpoint — the default, since this NAPI addon cannot load in edge runtimes
   * and bundlers cannot resolve its platform binaries.
   */
  performanceClient?: BasetenPerformanceClientConstructor;
}

export interface BasetenProvider extends ProviderV4 {
  /**
   * Creates a chat model for text generation.
   */
  (modelId?: BasetenChatModelId): LanguageModelV4;

  /**
   * Creates a chat model for text generation.
   */
  chatModel(modelId?: BasetenChatModelId): LanguageModelV4;

  /**
   * Creates a language model for text generation. Alias for chatModel.
   */
  languageModel(modelId?: BasetenChatModelId): LanguageModelV4;

  /**
   * Creates a embedding model for text generation.
   */
  embeddingModel(modelId?: BasetenEmbeddingModelId): EmbeddingModelV4;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId?: BasetenEmbeddingModelId): EmbeddingModelV4;
}

// by default, we use the Model APIs
const defaultBaseURL = 'https://inference.baseten.co/v1';

export function createBaseten(
  options: BasetenProviderSettings = {},
): BasetenProvider {
  const baseURL = withoutTrailingSlash(options.baseURL ?? defaultBaseURL);
  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'BASETEN_API_KEY',
          description: 'Baseten API key',
        })}`,
        ...options.headers,
      },
      `ai-sdk/baseten/${VERSION}`,
    );

  interface CommonModelConfig {
    provider: string;
    url: ({ path }: { path: string }) => string;
    headers: () => Record<string, string>;
    fetch?: FetchFunction;
  }

  const getCommonModelConfig = (
    modelType: string,
    customURL?: string,
  ): CommonModelConfig => ({
    provider: `baseten.${modelType}`,
    url: ({ path }) => {
      // For embeddings with /sync URLs (but not /sync/v1), we need to add /v1
      if (
        modelType === 'embedding' &&
        customURL?.includes('/sync') &&
        !customURL?.includes('/sync/v1')
      ) {
        return `${customURL}/v1${path}`;
      }
      return `${customURL || baseURL}${path}`;
    },
    headers: getHeaders,
    fetch: options.fetch,
  });

  const createChatModel = (modelId?: BasetenChatModelId) => {
    const customURL = options.modelURL;
    if (customURL) {
      if (customURL.includes('/sync/v1')) {
        return new OpenAICompatibleChatLanguageModel(modelId ?? 'placeholder', {
          ...getCommonModelConfig('chat', customURL),
          errorStructure: basetenErrorStructure,
          // Or stream_options.include_usage is omitted and streams report no usage.
          includeUsage: true,
          supportsStructuredOutputs: true,
        });
      } else if (customURL.includes('/predict')) {
        throw new Error(
          'Not supported. You must use a /sync/v1 endpoint for chat models.',
        );
      }
    }

    return new OpenAICompatibleChatLanguageModel(modelId ?? 'chat', {
      ...getCommonModelConfig('chat'),
      errorStructure: basetenErrorStructure,
      includeUsage: true,
      supportsStructuredOutputs: true,
    });
  };

  const createEmbeddingModel = (modelId?: BasetenEmbeddingModelId) => {
    const customURL = options.modelURL;
    if (!customURL) {
      throw new Error(
        'No model URL provided for embeddings. Please set modelURL option for embeddings.',
      );
    }

    if (!customURL.includes('/sync')) {
      throw new Error(
        'Not supported. You must use a /sync or /sync/v1 endpoint for embeddings.',
      );
    }

    // BEI embedding deployments are OpenAI-compatible with no extra settings, so
    // plain HTTP is the default and needs no override.
    const model = new OpenAICompatibleEmbeddingModel(modelId ?? 'embeddings', {
      ...getCommonModelConfig('embedding', customURL),
      errorStructure: basetenErrorStructure,
      // Over HTTP, cap each request and let `embedMany` split and parallelise.
      // The native client does its own batching, so let it take everything at
      // once — `embedMany` treats Infinity as "one call".
      maxEmbeddingsPerCall: options.performanceClient
        ? Number.POSITIVE_INFINITY
        : MAX_EMBEDDINGS_PER_CALL,
    });

    if (!options.performanceClient) {
      return model;
    }

    // Opted in to the native client. It appends /v1 itself, so hand it the bare
    // /sync form.
    const performanceClient = new options.performanceClient(
      customURL.replace('/sync/v1', '/sync'),
      loadApiKey({
        apiKey: options.apiKey,
        environmentVariableName: 'BASETEN_API_KEY',
        description: 'Baseten API key',
      }),
    );

    model.doEmbed = async params => {
      if (!params.values || !Array.isArray(params.values)) {
        throw new Error('params.values must be an array of strings');
      }

      const response = await performanceClient.embed(
        params.values,
        // model_id is for Model APIs; dedicated deployments ignore it.
        modelId ?? 'embeddings',
      );

      return {
        embeddings: response.data.map(item => item.embedding),
        // The native client types its response as `any`; only report usage when
        // a token count is actually present rather than `{ tokens: undefined }`.
        usage:
          typeof response.usage?.total_tokens === 'number'
            ? { tokens: response.usage.total_tokens }
            : undefined,
        response: { headers: {}, body: response },
        warnings: [],
      };
    };

    return model;
  };

  const provider = (modelId?: BasetenChatModelId) => createChatModel(modelId);

  provider.specificationVersion = 'v4' as const;
  provider.chatModel = createChatModel;
  provider.languageModel = createChatModel;
  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };
  provider.embeddingModel = createEmbeddingModel;
  provider.textEmbeddingModel = createEmbeddingModel;
  return provider;
}

export const baseten = createBaseten();
