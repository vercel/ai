import {
  OpenAICompatibleChatLanguageModel,
  OpenAICompatibleEmbeddingModel,
  OpenAICompatibleImageModel,
} from '@ai-sdk/openai-compatible';
import {
  type EmbeddingModelV4,
  type ImageModelV4,
  type LanguageModelV4,
  type ProviderV4,
  type RerankingModelV4,
  type SpeechModelV4,
  type TranscriptionModelV4,
} from '@ai-sdk/provider';
import {
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import type { NebulChatModelId } from './nebul-chat-options';
import type { NebulEmbeddingModelId } from './nebul-embedding-options';
import type { NebulImageModelId } from './nebul-image-options';
import { NebulRerankingModel } from './nebul-reranking-model';
import type { NebulRerankingModelId } from './nebul-reranking-options';
import { NebulSpeechModel } from './nebul-speech-model';
import type { NebulSpeechModelId } from './nebul-speech-options';
import { NebulTranscriptionModel } from './nebul-transcription-model';
import type { NebulTranscriptionModelId } from './nebul-transcription-options';
import { VERSION } from './version';

const defaultBaseURL = 'https://api.inference.nebul.io/v1';
const defaultChatModelId: NebulChatModelId = 'zai-org/GLM-5.3-Flash';

export interface NebulProviderSettings {
  /**
   * API key for authenticating requests to Nebul. Defaults to the value of the
   * `NEBUL_API_KEY` environment variable.
   */
  apiKey?: string;

  /**
   * Base URL for Nebul API calls. Defaults to
   * `https://api.inference.nebul.io/v1`.
   */
  baseURL?: string;

  /**
   * Additional headers to include in requests to Nebul.
   */
  headers?: Record<string, string>;

  /**
   * Custom fetch implementation. You can use it as a middleware to intercept
   * requests, or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;
}

export interface NebulProvider extends ProviderV4 {
  /**
   * Creates a model for text generation.
   */
  (modelId?: NebulChatModelId): LanguageModelV4;

  /**
   * Creates a chat model for text generation.
   */
  languageModel(modelId?: NebulChatModelId): LanguageModelV4;

  /**
   * Alias for languageModel.
   */
  chat(modelId?: NebulChatModelId): LanguageModelV4;

  /**
   * Creates a model for text embeddings.
   */
  embeddingModel(modelId: NebulEmbeddingModelId): EmbeddingModelV4;

  /**
   * Creates a model for image generation.
   */
  imageModel(modelId: NebulImageModelId): ImageModelV4;

  /**
   * Creates a model for transcription (speech to text).
   */
  transcriptionModel(modelId: NebulTranscriptionModelId): TranscriptionModelV4;

  /**
   * Creates a model for speech generation (text to speech).
   */
  speechModel(modelId: NebulSpeechModelId): SpeechModelV4;

  /**
   * Creates a model for reranking documents against a query.
   */
  rerankingModel(modelId: NebulRerankingModelId): RerankingModelV4;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: NebulEmbeddingModelId): EmbeddingModelV4;
}

export function createNebul(
  options: NebulProviderSettings = {},
): NebulProvider {
  const baseURL = withoutTrailingSlash(options.baseURL) ?? defaultBaseURL;

  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'NEBUL_API_KEY',
          description: 'Nebul API key',
        })}`,
        ...options.headers,
      },
      `ai-sdk/nebul/${VERSION}`,
    );

  interface CommonModelConfig {
    provider: string;
    baseURL: string;
    headers: () => Record<string, string | undefined>;
    fetch?: FetchFunction;
  }

  const getCommonModelConfig = (modelType: string): CommonModelConfig => ({
    provider: `nebul.${modelType}`,
    baseURL,
    headers: getHeaders,
    fetch: options.fetch,
  });

  const createChatModel = (modelId?: NebulChatModelId) =>
    new OpenAICompatibleChatLanguageModel(modelId ?? defaultChatModelId, {
      ...getCommonModelConfig('chat'),
      url: ({ path }) => `${baseURL}${path}`,
      includeUsage: true,
      supportsStructuredOutputs: true,
    });

  const createEmbeddingModel = (modelId: NebulEmbeddingModelId) =>
    new OpenAICompatibleEmbeddingModel(modelId, {
      ...getCommonModelConfig('embedding'),
      url: ({ path }) => `${baseURL}${path}`,
      maxEmbeddingsPerCall: 2048,
    });

  const createImageModel = (modelId: NebulImageModelId) =>
    new OpenAICompatibleImageModel(modelId, {
      ...getCommonModelConfig('image'),
      url: ({ path }) => `${baseURL}${path}`,
    });

  const createTranscriptionModel = (modelId: NebulTranscriptionModelId) =>
    new NebulTranscriptionModel(modelId, {
      ...getCommonModelConfig('transcription'),
    });

  const createSpeechModel = (modelId: NebulSpeechModelId) =>
    new NebulSpeechModel(modelId, {
      ...getCommonModelConfig('speech'),
    });

  const createRerankingModel = (modelId: NebulRerankingModelId) =>
    new NebulRerankingModel(modelId, {
      ...getCommonModelConfig('reranking'),
    });

  const provider = (modelId?: NebulChatModelId) => createChatModel(modelId);

  provider.specificationVersion = 'v4' as const;
  provider.languageModel = createChatModel;
  provider.chat = createChatModel;
  provider.embeddingModel = createEmbeddingModel;
  provider.imageModel = createImageModel;
  provider.transcriptionModel = createTranscriptionModel;
  provider.speechModel = createSpeechModel;
  provider.rerankingModel = createRerankingModel;

  provider.textEmbeddingModel = createEmbeddingModel; // deprecated

  return provider;
}

export const nebul = createNebul({
  baseURL: defaultBaseURL,
});
