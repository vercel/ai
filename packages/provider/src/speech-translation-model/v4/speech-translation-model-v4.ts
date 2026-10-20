import type { SpeechTranslationModelV4StreamOptions } from './speech-translation-model-v4-stream-options';
import type { SpeechTranslationModelV4StreamResult } from './speech-translation-model-v4-stream-result';

/**
 * Speech translation model specification version 4.
 *
 * Speech translation is a streaming-only modality: models translate live
 * source audio into target-language audio and text.
 *
 * Experimental: the speech translation model contract may change in patch
 * releases while the functions built on it are experimental. All types of
 * this modality are exported with `Experimental_` prefixes for this reason.
 */
export type SpeechTranslationModelV4 = {
  /**
   * The speech translation model must specify which speech translation model
   * interface version it implements. This will allow us to evolve the
   * speech translation model interface and retain backwards compatibility.
   * The different implementation versions can be handled as a discriminated
   * union on our side.
   */
  readonly specificationVersion: 'v4';

  /**
   * Name of the provider for logging purposes.
   */
  readonly provider: string;

  /**
   * Provider-specific model ID for logging purposes.
   */
  readonly modelId: string;

  /**
   * Streams a speech translation for live audio.
   */
  doStream(
    options: SpeechTranslationModelV4StreamOptions,
  ): PromiseLike<SpeechTranslationModelV4StreamResult>;
};
