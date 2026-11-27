import {
  InvalidArgumentError,
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
import { RevaiTranscriptionModel } from './revai-transcription-model';
import { revaiPollingOptionsShape } from './revai-transcription-model-options';
import type { RevaiTranscriptionModelId } from './revai-transcription-options';
import type { RevaiModelIds } from './revai-model-catalog';
import { VERSION } from './version';

export interface RevaiProvider extends ProviderV4 {
  (
    modelId: RevaiModelIds['legacyTranscription'],
    settings?: {},
  ): {
    transcription: RevaiTranscriptionModel;
  };

  /**
   * Creates a model for transcription.
   */
  transcription(modelId: RevaiTranscriptionModelId): TranscriptionModelV4;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: string): never;
}

export interface RevaiProviderSettings {
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
   * Defaults to 60000 (1 minute). Raise it for long audio files.
   */
  pollTimeoutMs?: number;
}

function validatePollingSettings(settings: RevaiProviderSettings) {
  const shape = revaiPollingOptionsShape();
  const value = settings.pollTimeoutMs;

  if (value != null && !shape.pollTimeoutMs.safeParse(value).success) {
    throw new InvalidArgumentError({
      argument: 'pollTimeoutMs',
      message:
        'pollTimeoutMs must be a positive integer number of milliseconds',
    });
  }
}

/**
 * Create a Rev.ai provider instance.
 */
export function createRevai(
  options: RevaiProviderSettings = {},
): RevaiProvider {
  validatePollingSettings(options);

  const getHeaders = () =>
    resolveWith(options.apiKey, apiKey =>
      withUserAgentSuffix(
        {
          authorization: `Bearer ${loadApiKey({
            apiKey,
            environmentVariableName: 'REVAI_API_KEY',
            description: 'Rev.ai',
          })}`,
          ...options.headers,
        },
        `ai-sdk-revai/${VERSION}`,
      ),
    );

  const createTranscriptionModel = (modelId: RevaiTranscriptionModelId) =>
    new RevaiTranscriptionModel(modelId, {
      provider: `revai.transcription`,
      url: ({ path }) => `https://api.rev.ai${path}`,
      headers: getHeaders,
      fetch: options.fetch,
      pollTimeoutMs: options.pollTimeoutMs,
    });

  const provider = function (modelId: RevaiTranscriptionModelId) {
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
      message: 'Rev.ai does not provide language models',
    });
  };

  provider.embeddingModel = () => {
    throw new NoSuchModelError({
      modelId: 'unknown',
      modelType: 'embeddingModel',
      message: 'Rev.ai does not provide text embedding models',
    });
  };
  provider.textEmbeddingModel = provider.embeddingModel;

  provider.imageModel = () => {
    throw new NoSuchModelError({
      modelId: 'unknown',
      modelType: 'imageModel',
      message: 'Rev.ai does not provide image models',
    });
  };

  return provider as RevaiProvider;
}

/**
 * Default Rev.ai provider instance.
 */
export const revai = createRevai();
