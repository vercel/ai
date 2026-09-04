import {
  NoSuchModelError,
  type TranscriptionModelV4,
  type ProviderV4,
} from '@ai-sdk/provider';
import {
  loadApiKey,
  withUserAgentSuffix,
  type FetchFunction,
  type WebSocketConstructor,
} from '@ai-sdk/provider-utils';
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
   * Creates a model for transcription. Pre-recorded models work with
   * `transcribe`; streaming models work with `experimental_streamTranscribe`.
   * `universal-3-5-pro` supports both.
   */
  transcription(modelId: AssemblyAITranscriptionModelId): TranscriptionModelV4;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: string): never;
}

export interface AssemblyAIProviderSettings {
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
   * Custom WebSocket implementation for streaming transcription
   * (`experimental_streamTranscribe`). AssemblyAI authenticates the streaming
   * connection with the `Authorization` header, which the native WebSocket
   * constructor in browsers, Node.js, Deno, and Bun cannot send. Pass a
   * header-capable implementation such as the `ws` package's `WebSocket`.
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
    withUserAgentSuffix(
      {
        authorization: loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'ASSEMBLYAI_API_KEY',
          description: 'AssemblyAI',
        }),
        ...options.headers,
      },
      `ai-sdk-assemblyai/${VERSION}`,
    );

  const createTranscriptionModel = (modelId: AssemblyAITranscriptionModelId) =>
    new AssemblyAITranscriptionModel(modelId, {
      provider: `assemblyai.transcription`,
      url: ({ path }) => `https://api.assemblyai.com${path}`,
      streamingUrl: ({ path }) => `https://streaming.assemblyai.com${path}`,
      headers: getHeaders,
      fetch: options.fetch,
      webSocket: options.webSocket,
    });

  const provider = function (modelId: AssemblyAITranscriptionModelId) {
    return {
      transcription: createTranscriptionModel(modelId),
    };
  };

  provider.specificationVersion = 'v4' as const;
  provider.transcription = createTranscriptionModel;
  provider.transcriptionModel = createTranscriptionModel;

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
