import type { SpeechModelV4CallOptions } from './speech-model-v4-call-options';
import type { SpeechModelV4Result } from './speech-model-v4-result';
import type { SpeechModelV4StreamOptions } from './speech-model-v4-stream-options';
import type { SpeechModelV4StreamResult } from './speech-model-v4-stream-result';

/**
 * Speech model specification version 4.
 */
export type SpeechModelV4 = {
  /**
   * The speech model must specify which speech model interface
   * version it implements. This will allow us to evolve the speech
   * model interface and retain backwards compatibility. The different
   * implementation versions can be handled as a discriminated union
   * on our side.
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
   * Generates speech audio from text.
   */
  doGenerate(
    options: SpeechModelV4CallOptions,
  ): PromiseLike<SpeechModelV4Result>;

  /**
   * Streams speech audio for streamed text input.
   *
   * Experimental: the streaming speech contract may change in patch
   * releases while `experimental_streamSpeech` is experimental. The
   * stream option/part/result/usage types are exported with
   * `Experimental_` prefixes for this reason.
   */
  doStream?(
    options: SpeechModelV4StreamOptions,
  ): PromiseLike<SpeechModelV4StreamResult>;
};
