import type { SpeechToSpeechModelV4StreamOptions } from './speech-to-speech-model-v4-stream-options';
import type { SpeechToSpeechModelV4StreamResult } from './speech-to-speech-model-v4-stream-result';

/**
 * Speech-to-speech model specification version 4.
 *
 * Speech-to-speech is a streaming-only modality: models transform live source
 * audio into output audio and text while preserving meaning. Examples include
 * speech translation and voice conversion. Task-flavored functions (e.g.
 * `experimental_streamTranslate`) constrain this general specification
 * further.
 *
 * Experimental: the speech-to-speech model contract may change in patch
 * releases while the functions built on it are experimental. All types of
 * this modality are exported with `Experimental_` prefixes for this reason.
 */
export type SpeechToSpeechModelV4 = {
  /**
   * The speech-to-speech model must specify which speech-to-speech model
   * interface version it implements. This will allow us to evolve the
   * speech-to-speech model interface and retain backwards compatibility.
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
   * Streams a speech-to-speech transformation for live audio.
   */
  doStream(
    options: SpeechToSpeechModelV4StreamOptions,
  ): PromiseLike<SpeechToSpeechModelV4StreamResult>;
};
