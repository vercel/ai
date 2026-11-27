import {
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
import { AssemblyAISpeechModel } from './assemblyai-speech-model';
import type { AssemblyAISpeechModelId } from './assemblyai-speech-settings';
import { AssemblyAITranscriptionModel } from './assemblyai-transcription-model';
import type { AssemblyAITranscriptionModelId } from './assemblyai-transcription-settings';
import { VERSION } from './version';

export interface AssemblyAIProvider extends ProviderV4 {
  (
    modelId: AssemblyAITranscriptionModelId,
    settings?: {},
  ): {
    transcription: AssemblyAITranscriptionModel;
  };

  /**
   * Creates a model for transcription.
   */
  transcription(modelId: AssemblyAITranscriptionModelId): TranscriptionModelV4;

  /**
   * Creates a model for speech generation.
   */
  speech(modelId: AssemblyAISpeechModelId): SpeechModelV4;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: string): never;
}

export interface AssemblyAIProviderSettings {
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

  /**
   * Custom WebSocket implementation for streaming transcription, e.g. the
   * `ws` package. AssemblyAI authenticates the streaming WebSocket with an
   * `Authorization` header, which the native WebSocket in browsers, Node.js,
   * Deno, and Bun cannot send.
   */
  webSocket?: WebSocketConstructor;
}

/**
 * Create an AssemblyAI provider instance.
 */
export function createAssemblyAI(
  options: AssemblyAIProviderSettings = {},
): AssemblyAIProvider {
  const getHeaders = () =>
    resolveWith(options.apiKey, apiKey =>
      withUserAgentSuffix(
        {
          authorization: loadApiKey({
            apiKey,
            environmentVariableName: 'ASSEMBLYAI_API_KEY',
            description: 'AssemblyAI',
          }),
          ...options.headers,
        },
        `ai-sdk-assemblyai/${VERSION}`,
      ),
    );

  const createTranscriptionModel = (modelId: AssemblyAITranscriptionModelId) =>
    new AssemblyAITranscriptionModel(modelId, {
      provider: `assemblyai.transcription`,
      // Streaming transcription runs on its own host.
      url: ({ path }) =>
        path === '/v3/ws'
          ? `wss://streaming.assemblyai.com${path}`
          : `https://api.assemblyai.com${path}`,
      headers: getHeaders,
      fetch: options.fetch,
      webSocket: options.webSocket,
    });

  const createSpeechModel = (modelId: AssemblyAISpeechModelId) =>
    new AssemblyAISpeechModel(modelId, {
      provider: `assemblyai.speech`,
      url: ({ path }) => `https://tts.us.assemblyai.com${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = function (modelId: AssemblyAITranscriptionModelId) {
    return {
      transcription: createTranscriptionModel(modelId),
    };
  };

  provider.specificationVersion = 'v4' as const;
  provider.transcription = createTranscriptionModel;
  provider.transcriptionModel = createTranscriptionModel;
  provider.speech = createSpeechModel;
  provider.speechModel = createSpeechModel;

  provider.languageModel = () => {
    throw new NoSuchModelError({
      modelId: 'unknown',
      modelType: 'languageModel',
      message: 'AssemblyAI does not provide language models',
    });
  };

  provider.embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
  };
  provider.textEmbeddingModel = provider.embeddingModel;

  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };

  return provider as AssemblyAIProvider;
}

/**
 * Default AssemblyAI provider instance.
 */
export const assemblyai = createAssemblyAI();
