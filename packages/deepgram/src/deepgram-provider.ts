import {
  type Experimental_RealtimeFactoryV4 as RealtimeFactoryV4,
  type Experimental_RealtimeFactoryV4GetTokenOptions as RealtimeFactoryV4GetTokenOptions,
  NoSuchModelError,
  type TranscriptionModelV4,
  type SpeechModelV4,
  type ProviderV4,
} from '@ai-sdk/provider';
import {
  resolveWith,
  type Resolvable,
  loadApiKey,
  withUserAgentSuffix,
  type FetchFunction,
  type WebSocketConstructor,
} from '@ai-sdk/provider-utils';
import { DeepgramTranscriptionModel } from './deepgram-transcription-model';
import type { DeepgramTranscriptionModelId } from './deepgram-transcription-options';
import { DeepgramSpeechModel } from './deepgram-speech-model';
import type { DeepgramSpeechModelId } from './deepgram-speech-options';
import { DeepgramRealtimeModel } from './deepgram-realtime-model';
import type { DeepgramRealtimeModelId } from './deepgram-realtime-model-options';
import { VERSION } from './version';

export interface DeepgramProvider extends ProviderV4 {
  (
    modelId: DeepgramTranscriptionModelId,
    settings?: {},
  ): {
    transcription: DeepgramTranscriptionModel;
  };

  /**
   * Creates a model for transcription.
   */
  transcription(modelId: DeepgramTranscriptionModelId): TranscriptionModelV4;

  /**
   * Creates a model for speech generation.
   */
  speech(modelId: DeepgramSpeechModelId): SpeechModelV4;

  /**
   * Creates a realtime model for Deepgram's Voice Agent. The model ID is
   * `voice-agent`; the LLM, voice, and listen model are session settings.
   */
  experimental_realtime: {
    (modelId: DeepgramRealtimeModelId): DeepgramRealtimeModel;
  } & RealtimeFactoryV4;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: string): never;
}

export interface DeepgramProviderSettings {
  /**
   * API key for authenticating requests. May be a string, promise, or a
   * synchronous/asynchronous callback called before each request.
   */
  apiKey?: Resolvable<string>;

  /**
   * Custom headers to include in the requests.
   */
  headers?: Record<string, string>;

  /**
   * Custom fetch implementation. You can use it as a middleware to intercept requests,
   * or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;

  /** Custom WebSocket implementation for streaming transcription and speech. */
  webSocket?: WebSocketConstructor;
}

/**
 * Create an Deepgram provider instance.
 */
export function createDeepgram(
  options: DeepgramProviderSettings = {},
): DeepgramProvider {
  const getHeaders = () =>
    resolveWith(options.apiKey, apiKey =>
      withUserAgentSuffix(
        {
          authorization: `Token ${loadApiKey({
            apiKey,
            environmentVariableName: 'DEEPGRAM_API_KEY',
            description: 'Deepgram',
          })}`,
          ...options.headers,
        },
        `ai-sdk-deepgram/${VERSION}`,
      ),
    );

  const createTranscriptionModel = (modelId: DeepgramTranscriptionModelId) =>
    new DeepgramTranscriptionModel(modelId, {
      provider: `deepgram.transcription`,
      url: ({ path }) => `https://api.deepgram.com${path}`,
      headers: getHeaders,
      fetch: options.fetch,
      webSocket: options.webSocket,
    });

  const createSpeechModel = (modelId: DeepgramSpeechModelId) =>
    new DeepgramSpeechModel(modelId, {
      provider: `deepgram.speech`,
      url: ({ path }) => `https://api.deepgram.com${path}`,
      headers: getHeaders,
      fetch: options.fetch,
      webSocket: options.webSocket,
    });

  const createRealtimeModel = (modelId: DeepgramRealtimeModelId) =>
    new DeepgramRealtimeModel(modelId, {
      provider: `deepgram.realtime`,
      baseURL: 'https://api.deepgram.com',
      webSocketURL: 'wss://agent.deepgram.com/v1/agent/converse',
      headers: getHeaders,
      fetch: options.fetch,
    });

  const experimentalRealtimeFactory = Object.assign(
    (modelId: DeepgramRealtimeModelId) => createRealtimeModel(modelId),
    {
      getToken: async (tokenOptions: RealtimeFactoryV4GetTokenOptions) => {
        const secret = await createRealtimeModel(
          tokenOptions.model,
        ).doCreateClientSecret({
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
  );

  const provider = function (modelId: DeepgramTranscriptionModelId) {
    return {
      transcription: createTranscriptionModel(modelId),
    };
  };

  provider.specificationVersion = 'v4' as const;
  provider.transcription = createTranscriptionModel;
  provider.transcriptionModel = createTranscriptionModel;
  provider.speech = createSpeechModel;
  provider.speechModel = createSpeechModel;
  provider.experimental_realtime = experimentalRealtimeFactory;

  // Required ProviderV4 methods that are not supported
  provider.languageModel = (modelId: string) => {
    throw new NoSuchModelError({
      modelId,
      modelType: 'languageModel',
      message: 'Deepgram does not provide language models',
    });
  };

  provider.embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({
      modelId,
      modelType: 'embeddingModel',
      message: 'Deepgram does not provide text embedding models',
    });
  };
  provider.textEmbeddingModel = provider.embeddingModel;

  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({
      modelId,
      modelType: 'imageModel',
      message: 'Deepgram does not provide image models',
    });
  };

  return provider as DeepgramProvider;
}

/**
 * Default Deepgram provider instance.
 */
export const deepgram = createDeepgram();
