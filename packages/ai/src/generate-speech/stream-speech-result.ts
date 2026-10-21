import type {
  Experimental_SpeechModelV4StreamUsage,
  JSONObject,
  SharedV4AudioFormat,
  SharedV4ProviderMetadata,
} from '@ai-sdk/provider';
import type { SpeechModelResponseMetadata } from '../types/speech-model-response-metadata';
import type { Warning } from '../types/warning';
import type { AsyncIterableStream } from '../util/async-iterable-stream';

export type SpeechStreamPart =
  | {
      /**
       * Audio chunk in generation order. Chunks are not necessarily
       * standalone files; concatenate them to reconstruct the audio.
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
