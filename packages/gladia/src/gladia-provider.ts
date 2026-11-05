import {
  NoSuchModelError,
  type TranscriptionModelV4,
  type ProviderV4,
} from '@ai-sdk/provider';
import {
  resolveWith,
  type Resolvable,
  loadApiKey,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { GladiaTranscriptionModel } from './gladia-transcription-model';
import type { GladiaTranscriptionModelId } from './gladia-transcription-options';
import { VERSION } from './version';

export interface GladiaProvider extends ProviderV4 {
  (): {
    transcription: GladiaTranscriptionModel;
  };

  /**
   * Creates a model for transcription.
   *
   * @param modelId - The transcription model to use (e.g. `solaria-1` or
   * `solaria-3`). If omitted, the Gladia API uses its default model.
   */
  transcription(modelId?: GladiaTranscriptionModelId): TranscriptionModelV4;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: string): never;
}

export interface GladiaProviderSettings {
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
   * Maximum time in milliseconds to wait for an asynchronous transcription job
   * to finish before throwing a `TranscriptionJobPollingTimedOut` error.
   * Defaults to 600000 (10 minutes). Raise it for long audio files or when
   * audio intelligence add-ons make processing take longer.
   */
  pollingTimeoutMs?: number;

  /**
   * Interval in milliseconds between transcription job status checks.
   * Defaults to 1000 (1 second).
   */
  pollingIntervalMs?: number;
}

/**
 * Create a Gladia provider instance.
 */
export function createGladia(
  options: GladiaProviderSettings = {},
): GladiaProvider {
  const getHeaders = () =>
    resolveWith(options.apiKey, apiKey =>
      withUserAgentSuffix(
        {
          'x-gladia-key': loadApiKey({
            apiKey,
            environmentVariableName: 'GLADIA_API_KEY',
            description: 'Gladia',
          }),
          'x-gladia-version': `ai-sdk/${VERSION}`,
          ...options.headers,
        },
        `ai-sdk-gladia/${VERSION}`,
      ),
    );

  const createTranscriptionModel = (
    modelId: GladiaTranscriptionModelId = 'default',
  ) =>
    new GladiaTranscriptionModel(modelId, {
      provider: `gladia.transcription`,
      url: ({ path }) => `https://api.gladia.io${path}`,
      headers: getHeaders,
      fetch: options.fetch,
      pollingTimeoutMs: options.pollingTimeoutMs,
      pollingIntervalMs: options.pollingIntervalMs,
    });

  const provider = function () {
    return {
      transcription: createTranscriptionModel(),
    };
  };

  provider.specificationVersion = 'v4' as const;
  provider.transcription = createTranscriptionModel;
  provider.transcriptionModel = createTranscriptionModel;

  // Required ProviderV4 methods that are not supported
  provider.languageModel = (modelId: string) => {
    throw new NoSuchModelError({
      modelId,
      modelType: 'languageModel',
      message: 'Gladia does not provide language models',
    });
  };

  provider.embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({
      modelId,
      modelType: 'embeddingModel',
      message: 'Gladia does not provide embedding models',
    });
  };
  provider.textEmbeddingModel = provider.embeddingModel;

  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({
      modelId,
      modelType: 'imageModel',
      message: 'Gladia does not provide image models',
    });
  };

  return provider as GladiaProvider;
}

/**
 * Default Gladia provider instance.
 */
export const gladia = createGladia();
