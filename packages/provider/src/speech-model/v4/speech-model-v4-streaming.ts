import type { SpeechModelV4 } from './speech-model-v4';
import type { SpeechModelV4StreamOptions } from './speech-model-v4-stream-options';
import type { SpeechModelV4StreamResult } from './speech-model-v4-stream-result';

/**
 * A speech model that can also stream speech audio for streamed text input.
 *
 * Experimental: kept separate from the stable `SpeechModelV4` contract while
 * `experimental_streamSpeech` is experimental, and may change in patch
 * releases. Exported with an `Experimental_` prefix.
 */
export type StreamingSpeechModelV4 = SpeechModelV4 & {
  /**
   * Streams speech audio for streamed text input.
   */
  doStream(
    options: SpeechModelV4StreamOptions,
  ): PromiseLike<SpeechModelV4StreamResult>;
};
