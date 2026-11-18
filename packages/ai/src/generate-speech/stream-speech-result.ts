import type {
  Experimental_SpeechModelV4StreamUsage,
  JSONObject,
  SharedV4AudioFormat,
  SharedV4ProviderMetadata,
} from '@ai-sdk/provider';
import type { ProviderOptions } from '@ai-sdk/provider-utils';
import type { SpeechModelResponseMetadata } from '../types/speech-model-response-metadata';
import type { Warning } from '../types/warning';
import type { AsyncIterableStream } from '../util/async-iterable-stream';

/**
 * A piece of text to synthesize. Pass a stream of these (or mix them with
 * plain strings) to give parts their own voice, e.g. for dialogue.
 */
export type SpeechTextPart = {
  type: 'text';
  text: string;

  /**
   * The voice that speaks this part (provider-specific, like the call's
   * `voice`). Single-voice providers reject a voice that differs from the
   * call's voice.
   */
  voice?: string;

  /**
   * Additional provider-specific options for this part.
   */
  providerOptions?: ProviderOptions;
};

export type SpeechStreamPart =
  | {
      /**
       * Audio chunk in generation order. Chunks are not necessarily
       * standalone files; concatenate them to reconstruct the audio. A chunk
       * is empty only when it carries `providerMetadata` (e.g. a turn marker).
       */
      type: 'audio';
      id?: string;
      audio: Uint8Array;
      audioFormat: SharedV4AudioFormat;
      providerMetadata?: SharedV4ProviderMetadata;
    }
  | {
      type: 'raw';
      rawValue: unknown;
    }
  | {
      type: 'error';
      error: unknown;
    };

export type SpeechStreamUsage = Experimental_SpeechModelV4StreamUsage;

export interface StreamSpeechResult {
  /**
   * Usage information reported for the call, if available.
   */
  readonly usage: PromiseLike<SpeechStreamUsage>;

  /**
   * Warnings for the call, e.g. unsupported settings.
   */
  readonly warnings: PromiseLike<Array<Warning>>;

  /**
   * Response metadata.
   */
  readonly responses: PromiseLike<Array<SpeechModelResponseMetadata>>;

  /**
   * Additional provider-specific metadata.
   */
  readonly providerMetadata: PromiseLike<Record<string, JSONObject>>;

  /**
   * Stream of audio bytes in generation order.
   *
   * `audioStream` and `fullStream` share one live stream: only one of them
   * can be accessed, and only once. Access it before any result promise;
   * accessing a result promise first consumes the stream internally.
   */
  readonly audioStream: AsyncIterableStream<Uint8Array>;

  /**
   * Full stream of speech parts (audio, raw, and error parts).
   *
   * `audioStream` and `fullStream` share one live stream: only one of them
   * can be accessed, and only once. Access it before any result promise;
   * accessing a result promise first consumes the stream internally.
   */
  readonly fullStream: AsyncIterableStream<SpeechStreamPart>;
}
