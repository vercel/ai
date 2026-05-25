import {
  NoSuchModelError,
  type ProviderV4,
  type SpeechModelV4,
  type TranscriptionModelV4,
} from '@ai-sdk/provider';
import {
  type FetchFunction,
  loadApiKey,
  withUserAgentSuffix,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import type { GradiumConfig } from './gradium-config';
import { GradiumSpeechModel } from './gradium-speech-model';
import type { GradiumSpeechModelId } from './gradium-speech-options';
import { GradiumTranscriptionModel } from './gradium-transcription-model';
import type { GradiumTranscriptionModelId } from './gradium-transcription-options';
import {
  createGradiumCreditsAPI,
  createGradiumPronunciationsAPI,
  type GradiumCreditsAPI,
  type GradiumPronunciationsAPI,
} from './gradium-pronunciations';
import {
  createGradiumVoicesAPI,
  type GradiumVoicesAPI,
} from './gradium-voices';
import { VERSION } from './version';

const DEFAULT_BASE_URL = 'https://api.gradium.ai/api';

export interface GradiumProviderSettings {
  /**
   * Base URL of the Gradium API. No trailing slash.
   * @default `https://api.gradium.ai/api`
   */
  baseURL?: string;

  /**
   * Gradium API key. Defaults to the `GRADIUM_API_KEY` environment variable.
   * Sent as the `x-api-key` header on every request.
   */
  apiKey?: string;

  /**
   * Custom headers merged into every request.
   */
  headers?: Record<string, string>;

  /**
   * Custom fetch implementation. Useful for proxying, testing, and request
   * inspection. Defaults to the global `fetch`.
   */
  fetch?: FetchFunction;
}

export interface GradiumProvider extends ProviderV4 {
  (
    modelId?: GradiumTranscriptionModelId,
    settings?: {},
  ): {
    transcription: GradiumTranscriptionModel;
  };

  /**
   * Create a Gradium speech (text-to-speech) model.
   *
   * @example
   * ```ts
   * import { gradium } from '@ai-sdk/gradium';
   * import { experimental_generateSpeech as generateSpeech } from 'ai';
   *
   * const { audio } = await generateSpeech({
   *   model: gradium.speech('default'),
   *   text: 'Hello from Gradium.',
   *   voice: 'YTpq7expH9539ERJ',
   * });
   * ```
   */
  speech(modelId?: GradiumSpeechModelId): SpeechModelV4;

  /**
   * Create a Gradium transcription (speech-to-text) model.
   *
   * @example
   * ```ts
   * import { gradium } from '@ai-sdk/gradium';
   * import { experimental_transcribe as transcribe } from 'ai';
   * import { readFile } from 'node:fs/promises';
   *
   * const { text } = await transcribe({
   *   model: gradium.transcription('default'),
   *   audio: await readFile('./input.wav'),
   *   mediaType: 'audio/wav',
   * });
   * ```
   */
  transcription(modelId?: GradiumTranscriptionModelId): TranscriptionModelV4;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: string): never;

  /** Voice management: list, create, get, update, delete. */
  voices: GradiumVoicesAPI;

  /** Pronunciation dictionary management: list, create, get, update, delete. */
  pronunciations: GradiumPronunciationsAPI;

  /** Billing-period credit balance. */
  credits: GradiumCreditsAPI;
}

export function createGradium(
  options: GradiumProviderSettings = {},
): GradiumProvider {
  const baseURL = withoutTrailingSlash(options.baseURL ?? DEFAULT_BASE_URL)!;

  const getHeaders = () =>
    withUserAgentSuffix(
      {
        'x-api-key': loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'GRADIUM_API_KEY',
          description: 'Gradium',
        }),
        ...options.headers,
      },
      `ai-sdk/gradium/${VERSION}`,
    );

  const speechConfig: GradiumConfig = {
    provider: 'gradium.speech',
    url: ({ path }) => `${baseURL}${path}`,
    headers: getHeaders,
    fetch: options.fetch,
  };

  const transcriptionConfig: GradiumConfig = {
    provider: 'gradium.transcription',
    url: ({ path }) => `${baseURL}${path}`,
    headers: getHeaders,
    fetch: options.fetch,
  };

  const restConfig: GradiumConfig = {
    provider: 'gradium',
    url: ({ path }) => `${baseURL}${path}`,
    headers: getHeaders,
    fetch: options.fetch,
  };

  const createSpeechModel = (
    modelId: GradiumSpeechModelId = 'default',
  ): GradiumSpeechModel => new GradiumSpeechModel(modelId, speechConfig);

  const createTranscriptionModel = (
    modelId: GradiumTranscriptionModelId = 'default',
  ): GradiumTranscriptionModel =>
    new GradiumTranscriptionModel(modelId, transcriptionConfig);

  const provider = function (modelId: GradiumTranscriptionModelId = 'default') {
    return {
      transcription: createTranscriptionModel(modelId),
    };
  };

  provider.specificationVersion = 'v4' as const;

  // Convenience aliases for idiomatic AI SDK community usage.
  provider.speech = createSpeechModel;
  provider.transcription = createTranscriptionModel;

  // ProviderV4 standardised method names.
  provider.speechModel = createSpeechModel;
  provider.transcriptionModel = createTranscriptionModel;

  // Gradium-specific helper APIs, outside the ProviderV4 contract.
  provider.voices = createGradiumVoicesAPI(restConfig);
  provider.pronunciations = createGradiumPronunciationsAPI(restConfig);
  provider.credits = createGradiumCreditsAPI(restConfig);

  // ProviderV4 requires these; Gradium does not ship LLMs/embeddings/images.
  provider.languageModel = (modelId: string) => {
    throw new NoSuchModelError({
      modelId,
      modelType: 'languageModel',
      message: 'Gradium does not provide language models',
    });
  };
  provider.embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({
      modelId,
      modelType: 'embeddingModel',
      message: 'Gradium does not provide embedding models',
    });
  };
  provider.textEmbeddingModel = provider.embeddingModel;
  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({
      modelId,
      modelType: 'imageModel',
      message: 'Gradium does not provide image models',
    });
  };

  return provider as GradiumProvider;
}

/**
 * Default Gradium provider instance.
 *
 * Uses the `GRADIUM_API_KEY` environment variable.
 * Call `createGradium({...})` for custom configuration.
 */
export const gradium: GradiumProvider = createGradium();
