import type { Experimental_SpeechModelV4StreamPart } from '@ai-sdk/provider';
import type { SpeechModelResponseMetadata } from '../types/speech-model-response-metadata';
import type { Warning } from '../types/warning';
import type { AsyncIterableStream } from '../util/async-iterable-stream';

export type SpeechStreamPart = Omit<
  Experimental_SpeechModelV4StreamPart,
  'audio'
> & { audio: Uint8Array };

export interface StreamSpeechResult {
  /**
   * Audio bytes in generation order. Chunks need not be standalone files.
   * Choose either audioStream or fullStream; they share one underlying stream.
   * Cancelling the stream cancels the provider response.
   */
  readonly audioStream: AsyncIterableStream<Uint8Array>;

  /** Audio chunks with their media type and provider-specific metadata. */
  readonly fullStream: AsyncIterableStream<SpeechStreamPart>;

  /** Warnings available when the request starts. */
  readonly warnings: Array<Warning>;

  /** Metadata for the streaming response, without a buffered response body. */
  readonly responses: Array<SpeechModelResponseMetadata>;
}
