import {
  type TranscriptionModelV2,
  type ProviderV2,
  InvalidArgumentError,
  NoSuchModelError,
} from '@ai-sdk/provider';
import {
  type FetchFunction,
  loadApiKey,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import {
  GladiaTranscriptionModel,
  gladiaPollingOptionsShape,
} from './gladia-transcription-model';
import { VERSION } from './version';

export interface GladiaProvider extends ProviderV2 {
  (): {
    transcription: GladiaTranscriptionModel;
  };

  /**
Creates a model for transcription.
   */
  transcription(): TranscriptionModelV2;
}

export interface GladiaProviderSettings {
  /**
API key for authenticating requests.
     */
  apiKey?: string;

  /**
Custom headers to include in the requests.
     */
  headers?: Record<string, string>;

  /**
Custom fetch implementation. You can use it as a middleware to intercept requests,
or to provide a custom fetch implementation for e.g. testing.
    */
  fetch?: FetchFunction;

  /**
   * Interval in milliseconds between transcription job status checks.
   * Defaults to 1000 (1 second).
   */
  pollIntervalMs?: number;

  /**
   * Maximum time in milliseconds to wait for an asynchronous transcription job
   * to finish before throwing a `TranscriptionJobPollingTimedOut` error.
   * Defaults to 600000 (10 minutes). Raise it for long audio files or when
   * audio intelligence add-ons make processing take longer.
   */
  pollTimeoutMs?: number;
}

function validatePollingSettings(settings: GladiaProviderSettings) {
  const shape = gladiaPollingOptionsShape();

  for (const argument of ['pollIntervalMs', 'pollTimeoutMs'] as const) {
    const value = settings[argument];

    if (value == null) {
      continue;
    }

    if (!shape[argument].safeParse(value).success) {
      throw new InvalidArgumentError({
        argument,
        message: `${argument} must be a positive integer number of milliseconds`,
      });
    }
  }
}

/**
Create a Gladia provider instance.
 */
export function createGladia(
  options: GladiaProviderSettings = {},
): GladiaProvider {
  validatePollingSettings(options);

  const getHeaders = () =>
    withUserAgentSuffix(
      {
        'x-gladia-key': loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'GLADIA_API_KEY',
          description: 'Gladia',
        }),
        ...options.headers,
      },
      `ai-sdk/gladia/${VERSION}`,
    );

  const createTranscriptionModel = () =>
    new GladiaTranscriptionModel('default', {
      provider: `gladia.transcription`,
      url: ({ path }) => `https://api.gladia.io${path}`,
      headers: getHeaders,
      fetch: options.fetch,
      pollIntervalMs: options.pollIntervalMs,
      pollTimeoutMs: options.pollTimeoutMs,
    });

  const provider = function () {
    return {
      transcription: createTranscriptionModel(),
    };
  };

  provider.transcription = createTranscriptionModel;
  provider.transcriptionModel = createTranscriptionModel;

  // Required ProviderV2 methods that are not supported
  provider.languageModel = () => {
    throw new NoSuchModelError({
      modelId: 'unknown',
      modelType: 'languageModel',
      message: 'Gladia does not provide language models',
    });
  };

  provider.textEmbeddingModel = () => {
    throw new NoSuchModelError({
      modelId: 'unknown',
      modelType: 'textEmbeddingModel',
      message: 'Gladia does not provide text embedding models',
    });
  };

  provider.imageModel = () => {
    throw new NoSuchModelError({
      modelId: 'unknown',
      modelType: 'imageModel',
      message: 'Gladia does not provide image models',
    });
  };

  return provider as GladiaProvider;
}

/**
Default Gladia provider instance.
 */
export const gladia = createGladia();
