import {
  type LanguageModelV4,
  type TranscriptionModelV4,
  type TranscriptionModelProviderV4,
  type EmbeddingModelProviderV4,
  type ImageModelProviderV4,
} from '@ai-sdk/provider';
import {
  loadApiKey,
  noSuchModel,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { AssemblyAITranscriptionModel } from './assemblyai-transcription-model';
import type { AssemblyAITranscriptionModelId } from './assemblyai-transcription-settings';
import { VERSION } from './version';

export interface AssemblyAIProvider
  extends
    TranscriptionModelProviderV4<AssemblyAITranscriptionModelId>,
    EmbeddingModelProviderV4,
    ImageModelProviderV4 {
  (
    modelId: AssemblyAITranscriptionModelId,
    settings?: {},
  ): {
    transcription: AssemblyAITranscriptionModel;
  };
  languageModel(modelId: string): LanguageModelV4;

  /**
   * Creates a model for transcription.
   */
  transcription(modelId: AssemblyAITranscriptionModelId): TranscriptionModelV4;
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
 * Default AssemblyAI provider instance.
 */
export const assemblyai = createAssemblyAI();
