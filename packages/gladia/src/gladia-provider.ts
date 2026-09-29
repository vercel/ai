import {
  type TranscriptionModelV4,
  type LanguageModelV4,
  type EmbeddingModelProviderV4,
  type ImageModelProviderV4,
} from '@ai-sdk/provider';
import {
  loadApiKey,
  noSuchModel,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { GladiaTranscriptionModel } from './gladia-transcription-model';
import { VERSION } from './version';

export interface GladiaProvider
  extends EmbeddingModelProviderV4, ImageModelProviderV4 {
  (): {
    transcription: GladiaTranscriptionModel;
  };

  languageModel(modelId: string): LanguageModelV4;

  /**
   * Creates a model for transcription.
   */
  transcription(): TranscriptionModelV4;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: string): never;
}

export interface GladiaProviderSettings {
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
}

/**
 * Create a Gladia provider instance.
 */
export function createGladia(
  options: GladiaProviderSettings = {},
): GladiaProvider {
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
      `ai-sdk-gladia/${VERSION}`,
    );

  const createTranscriptionModel = () =>
    new GladiaTranscriptionModel('default', {
      provider: `gladia.transcription`,
      url: ({ path }) => `https://api.gladia.io${path}`,
      headers: getHeaders,
      fetch: options.fetch,
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
  provider.languageModel = (modelId: string) =>
    noSuchModel(modelId, 'languageModel');

  provider.embeddingModel = (modelId: string) =>
    noSuchModel(modelId, 'embeddingModel');
  provider.embedding = provider.embeddingModel;
  provider.textEmbeddingModel = provider.embeddingModel;

  provider.imageModel = (modelId: string) => noSuchModel(modelId, 'imageModel');
  provider.image = provider.imageModel;

  return provider;
}

/**
 * Default Gladia provider instance.
 */
export const gladia = createGladia();
