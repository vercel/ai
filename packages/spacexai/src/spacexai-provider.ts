import {
  type Experimental_RealtimeFactoryV4 as RealtimeFactoryV4,
  type Experimental_RealtimeFactoryV4GetTokenOptions as RealtimeFactoryV4GetTokenOptions,
  type Experimental_VideoModelV4,
  type FilesV4,
  type ImageModelV4,
  type LanguageModelV4,
  NoSuchModelError,
  type ProviderV4,
  type SpeechModelV4,
  type TranscriptionModelV4,
} from '@ai-sdk/provider';
import {
  generateId,
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
  type FetchFunction,
  type WebSocketConstructor,
} from '@ai-sdk/provider-utils';
import { SpaceXAIChatLanguageModel } from './spacexai-chat-language-model';
import type { SpaceXAIChatModelId } from './spacexai-chat-language-model-options';
import { SpaceXAIImageModel } from './spacexai-image-model';
import type { SpaceXAIImageModelId } from './spacexai-image-settings';
import { SpaceXAIResponsesLanguageModel } from './responses/spacexai-responses-language-model';
import type { SpaceXAIResponsesModelId } from './responses/spacexai-responses-language-model-options';
import { SpaceXAIRealtimeModel } from './realtime/spacexai-realtime-model';
import { spacexaiTools } from './tool';
import { VERSION } from './version';
import { SpaceXAIFiles } from './files/spacexai-files';
import { SpaceXAIVideoModel } from './spacexai-video-model';
import type { SpaceXAIVideoModelId } from './spacexai-video-settings';
import { SpaceXAISpeechModel } from './spacexai-speech-model';
import { SpaceXAITranscriptionModel } from './spacexai-transcription-model';

export interface SpaceXAIProvider extends ProviderV4 {
  (modelId: SpaceXAIResponsesModelId): LanguageModelV4;

  /**
   * Creates a SpaceXAI language model for text generation.
   */
  languageModel(modelId: SpaceXAIResponsesModelId): LanguageModelV4;

  /**
   * Creates a SpaceXAI chat model for text generation.
   */
  chat: (modelId: SpaceXAIChatModelId) => LanguageModelV4;

  /**
   * Creates a SpaceXAI responses model for text generation.
   */
  responses: (modelId: SpaceXAIResponsesModelId) => LanguageModelV4;

  /**
   * Creates a SpaceXAI image model for image generation.
   */
  image(modelId: SpaceXAIImageModelId): ImageModelV4;

  /**
   * Creates a SpaceXAI image model for image generation.
   */
  imageModel(modelId: SpaceXAIImageModelId): ImageModelV4;

  /**
   * Creates a SpaceXAI video model for video generation.
   */
  video(modelId: SpaceXAIVideoModelId): Experimental_VideoModelV4;

  /**
   * Creates a SpaceXAI video model for video generation.
   */
  videoModel(modelId: SpaceXAIVideoModelId): Experimental_VideoModelV4;

  experimental_realtime: RealtimeFactoryV4;

  /**
   * Creates a SpaceXAI model for speech generation (text-to-speech).
   */
  speech(): SpeechModelV4;

  /**
   * Creates a SpaceXAI model for speech generation (text-to-speech).
   */
  speechModel(): SpeechModelV4;

  /**
   * Creates a SpaceXAI model for speech-to-text transcription.
   */
  transcription(): TranscriptionModelV4;

  /**
   * Creates a SpaceXAI model for speech-to-text transcription.
   */
  transcriptionModel(): TranscriptionModelV4;

  /**
   * Returns the SpaceXAI files interface for uploading files.
   */
  files(): FilesV4;

  /**
   * Server-side agentic tools for use with the responses API.
   */
  tools: typeof spacexaiTools;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: string): never;
}

/** @deprecated Use `SpaceXAIProvider` instead. */
export type XaiProvider = SpaceXAIProvider;

export interface SpaceXAIProviderSettings {
  /**
   * Base URL for the xAI API calls.
   */
  baseURL?: string;

  /**
   * API key for authenticating requests.
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
   * Custom WebSocket implementation. Required in runtimes whose native
   * WebSocket constructor does not support headers for xAI streaming STT.
   */
  webSocket?: WebSocketConstructor;
}

/** @deprecated Use `SpaceXAIProviderSettings` instead. */
export type XaiProviderSettings = SpaceXAIProviderSettings;

export function createSpaceXAI(
  options: SpaceXAIProviderSettings = {},
): SpaceXAIProvider {
  const baseURL = withoutTrailingSlash(
    options.baseURL ?? 'https://api.x.ai/v1',
  );
  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'XAI_API_KEY',
          description: 'xAI API key',
        })}`,
        ...options.headers,
      },
      `ai-sdk/spacexai/${VERSION}`,
    );

  const createChatLanguageModel = (modelId: SpaceXAIChatModelId) => {
    return new SpaceXAIChatLanguageModel(modelId, {
      provider: 'spacexai.chat',
      baseURL,
      headers: getHeaders,
      generateId,
      fetch: options.fetch,
    });
  };

  const createResponsesLanguageModel = (modelId: SpaceXAIResponsesModelId) => {
    return new SpaceXAIResponsesLanguageModel(modelId, {
      provider: 'spacexai.responses',
      baseURL,
      headers: getHeaders,
      generateId,
      fetch: options.fetch,
    });
  };

  const createImageModel = (modelId: SpaceXAIImageModelId) => {
    return new SpaceXAIImageModel(modelId, {
      provider: 'spacexai.image',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });
  };

  const createVideoModel = (modelId: SpaceXAIVideoModelId) => {
    return new SpaceXAIVideoModel(modelId, {
      provider: 'spacexai.video',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });
  };

  const createRealtimeModel = (modelId: string) => {
    return new SpaceXAIRealtimeModel(modelId, {
      provider: 'spacexai.realtime',
      baseURL: baseURL ?? 'https://api.x.ai/v1',
      headers: getHeaders,
      fetch: options.fetch,
    });
  };

  const createSpeechModel = () => {
    return new SpaceXAISpeechModel('', {
      provider: 'spacexai.speech',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });
  };

  const createTranscriptionModel = () => {
    return new SpaceXAITranscriptionModel('', {
      provider: 'spacexai.transcription',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
      webSocket: options.webSocket,
    });
  };

  const experimentalRealtimeFactory = Object.assign(
    (modelId: string) => createRealtimeModel(modelId),
    {
      getToken: async (tokenOptions: RealtimeFactoryV4GetTokenOptions) => {
        const model = createRealtimeModel(tokenOptions.model);
        const secret = await model.doCreateClientSecret({
          sessionConfig: tokenOptions.sessionConfig,
          expiresAfterSeconds: tokenOptions.expiresAfterSeconds,
        });

        return {
          token: secret.token,
          url: secret.url,
          expiresAt: secret.expiresAt,
        };
      },
    },
  ) as RealtimeFactoryV4;

  const createFiles = () =>
    new SpaceXAIFiles({
      provider: 'spacexai.files',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = (modelId: SpaceXAIResponsesModelId) =>
    createResponsesLanguageModel(modelId);

  provider.specificationVersion = 'v4' as const;
  provider.languageModel = createResponsesLanguageModel;
  provider.chat = createChatLanguageModel;
  provider.responses = createResponsesLanguageModel;
  provider.embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
  };
  provider.textEmbeddingModel = provider.embeddingModel;
  provider.imageModel = createImageModel;
  provider.image = createImageModel;
  provider.videoModel = createVideoModel;
  provider.video = createVideoModel;
  provider.experimental_realtime = experimentalRealtimeFactory;
  provider.speechModel = createSpeechModel;
  provider.speech = createSpeechModel;
  provider.transcriptionModel = createTranscriptionModel;
  provider.transcription = createTranscriptionModel;
  provider.files = createFiles;
  provider.tools = spacexaiTools;

  return provider;
}

/** @deprecated Use `createSpaceXAI` instead. */
export const createXai = createSpaceXAI;

export const spacexai = createSpaceXAI();

/** @deprecated Use `spacexai` instead. */
export const xai = spacexai;
