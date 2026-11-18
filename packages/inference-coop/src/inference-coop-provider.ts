import {
  NoSuchModelError,
  type ImageModelV4,
  type LanguageModelV4,
  type ProviderV4,
  type SpeechModelV4,
  type TranscriptionModelV4,
} from '@ai-sdk/provider';
import {
  type Resolvable,
  resolveWith,
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { InferenceCoopChatLanguageModel } from './inference-coop-chat-language-model';
import type { InferenceCoopChatModelId } from './inference-coop-chat-options';
import { InferenceCoopImageModel } from './inference-coop-image-model';
import type { InferenceCoopImageModelId } from './inference-coop-image-model-options';
import { InferenceCoopSpeechModel } from './inference-coop-speech-model';
import type { InferenceCoopSpeechModelId } from './inference-coop-speech-model-options';
import { InferenceCoopTranscriptionModel } from './inference-coop-transcription-model';
import type { InferenceCoopTranscriptionModelId } from './inference-coop-transcription-model-options';
import { VERSION } from './version';

export interface InferenceCoopProviderSettings {
  /**
   * Inference Cooperative API key. Defaults to the `INFERENCE_COOP_API_KEY`
   * environment variable. Create a key in the Member Dashboard at
   * https://dashboard.inference.coop.
   */
  apiKey?: Resolvable<string>;
  /**
   * Base URL for the API calls. Defaults to
   * `https://gateway.inference.coop/v1`.
   */
  baseURL?: string;
  /**
   * Custom headers to include in the requests.
   */
  headers?: Record<string, string>;
  /**
   * Custom fetch implementation. You can use it as a middleware to intercept
   * requests, or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;
}

export interface InferenceCoopProvider extends ProviderV4 {
  /**
   * Creates an Inference Cooperative model for text generation.
   */
  (modelId: InferenceCoopChatModelId): LanguageModelV4;

  /**
   * Creates an Inference Cooperative model for text generation.
   */
  languageModel(modelId: InferenceCoopChatModelId): LanguageModelV4;

  /**
   * Creates an Inference Cooperative chat model for text generation.
   */
  chat(modelId: InferenceCoopChatModelId): LanguageModelV4;

  /**
   * Creates an Inference Cooperative model for image generation.
   */
  image(modelId: InferenceCoopImageModelId): ImageModelV4;

  /**
   * Creates an Inference Cooperative model for image generation.
   */
  imageModel(modelId: InferenceCoopImageModelId): ImageModelV4;

  /**
   * Creates an Inference Cooperative model for text-to-speech.
   */
  speech(modelId: InferenceCoopSpeechModelId): SpeechModelV4;

  /**
   * Creates an Inference Cooperative model for text-to-speech.
   */
  speechModel(modelId: InferenceCoopSpeechModelId): SpeechModelV4;

  /**
   * Creates an Inference Cooperative model for speech-to-text transcription.
   */
  transcription(
    modelId: InferenceCoopTranscriptionModelId,
  ): TranscriptionModelV4;

  /**
   * Creates an Inference Cooperative model for speech-to-text transcription.
   */
  transcriptionModel(
    modelId: InferenceCoopTranscriptionModelId,
  ): TranscriptionModelV4;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: string): never;
}

/**
 * Create an Inference Cooperative provider instance.
 */
export function createInferenceCoop(
  options: InferenceCoopProviderSettings = {},
): InferenceCoopProvider {
  const baseURL = withoutTrailingSlash(
    options.baseURL ?? 'https://gateway.inference.coop/v1',
  );

  const getHeaders = () =>
    resolveWith(options.apiKey, apiKey =>
      withUserAgentSuffix(
        {
          Authorization: `Bearer ${loadApiKey({
            apiKey,
            environmentVariableName: 'INFERENCE_COOP_API_KEY',
            description: 'Inference Cooperative',
          })}`,
          ...options.headers,
        },
        `ai-sdk-inference-coop/${VERSION}`,
      ),
    );

  const createLanguageModel = (modelId: InferenceCoopChatModelId) => {
    return new InferenceCoopChatLanguageModel(modelId, {
      provider: 'inference-coop.chat',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
      includeUsage: true,
    });
  };

  const createImageModel = (modelId: InferenceCoopImageModelId) => {
    return new InferenceCoopImageModel(modelId, {
      provider: 'inference-coop.image',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });
  };

  const createSpeechModel = (modelId: InferenceCoopSpeechModelId) => {
    return new InferenceCoopSpeechModel(modelId, {
      provider: 'inference-coop.speech',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });
  };

  const createTranscriptionModel = (
    modelId: InferenceCoopTranscriptionModelId,
  ) => {
    return new InferenceCoopTranscriptionModel(modelId, {
      provider: 'inference-coop.transcription',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });
  };

  const provider = (modelId: InferenceCoopChatModelId) =>
    createLanguageModel(modelId);

  provider.specificationVersion = 'v4' as const;
  provider.languageModel = createLanguageModel;
  provider.chat = createLanguageModel;
  provider.image = createImageModel;
  provider.imageModel = createImageModel;
  provider.speech = createSpeechModel;
  provider.speechModel = createSpeechModel;
  provider.transcription = createTranscriptionModel;
  provider.transcriptionModel = createTranscriptionModel;

  provider.embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
  };
  provider.textEmbeddingModel = provider.embeddingModel;

  return provider;
}

/**
 * Default Inference Cooperative provider instance.
 */
export const inferenceCoop = createInferenceCoop();
