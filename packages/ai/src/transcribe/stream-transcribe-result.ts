import type { JSONObject } from '@ai-sdk/provider';
import type { AsyncIterableStream } from '../util/async-iterable-stream';
import type { TranscriptionModelResponseMetadata } from '../types/transcription-model-response-metadata';
import type { Warning } from '../types/warning';

export type TranscriptionStreamPart =
  | {
      type: 'transcript-delta';
      id?: string;
      delta: string;
    }
  | {
      type: 'transcript-partial';
      id?: string;
      text: string;
      startSecond?: number;
      durationInSeconds?: number;
      channelIndex?: number;
    }
  | {
      type: 'transcript-final';
      id?: string;
      text: string;
      startSecond?: number;
      endSecond?: number;
      channelIndex?: number;
    }
  | {
      type: 'raw';
      rawValue: unknown;
    }
  | {
      type: 'error';
      error: unknown;
    };

export interface StreamTranscriptionResult {
  /**
   * The final transcribed text.
   */
  readonly text: PromiseLike<string>;

  /**
   * Final transcript segments with timing information, if available.
   */
  readonly segments: PromiseLike<
    Array<{
      text: string;
      startSecond: number;
      endSecond: number;
    }>
  >;

  /**
   * Warnings for the call, e.g. unsupported settings.
   */
  readonly warnings: PromiseLike<Array<Warning>>;

  /**
   * Response metadata.
   */
  readonly responses: PromiseLike<Array<TranscriptionModelResponseMetadata>>;

  /**
   * Additional provider-specific metadata.
   */
  readonly providerMetadata: PromiseLike<Record<string, JSONObject>>;

  /**
   * Full stream of transcription parts.
   */
  readonly fullStream: AsyncIterableStream<TranscriptionStreamPart>;
}
