import type {
  JSONObject,
  SharedV4AudioFormat,
  TranscriptionModelV4TimestampGranularity,
} from '@ai-sdk/provider';
import type { ProviderOptions } from '@ai-sdk/provider-utils';
import type { ProviderMetadata } from '../types';
import type { TranscriptionModelResponseMetadata } from '../types/transcription-model-response-metadata';
import type { Warning } from '../types/warning';

/**
 * Event passed to telemetry integrations when transcription begins.
 */
type TranscriptionStartEventFor<OPERATION_ID extends string> = {
  /** Unique identifier for this transcription call. */
  readonly callId: string;

  /** Identifies the operation type (`ai.transcribe` or `ai.streamTranscribe`). */
  readonly operationId: OPERATION_ID;

  /** The provider identifier. */
  readonly provider: string;

  /** The specific model identifier. */
  readonly modelId: string;

  /**
   * Metadata about the input audio. Native URL transcription does not inspect
   * the audio, so its byte length and media type are unknown. Streaming byte
   * length is reported on the end event after consuming the stream.
   */
  readonly audio: {
    readonly byteLength: number | undefined;
    /**
     * The media type, when it is known before input preparation completes.
     * URL downloads and invalid inline inputs can begin without this metadata.
     */
    readonly mediaType: string | undefined;
  };

  /** The raw input format for streaming transcription. */
  readonly inputAudioFormat: SharedV4AudioFormat | undefined;

  /** Maximum number of retries for non-streaming transcription. */
  readonly maxRetries: number | undefined;

  /** Additional HTTP or WebSocket headers sent with the request. */
  readonly headers: Record<string, string> | undefined;

  /** Additional provider-specific options. */
  readonly providerOptions: ProviderOptions;
};

export type TranscriptionStartEvent =
  TranscriptionStartEventFor<'ai.transcribe'> & {
    /** Requested shared timing granularities, when specified. */
    readonly timestampGranularities?: Array<TranscriptionModelV4TimestampGranularity>;
  };

export type StreamTranscriptionStartEvent =
  TranscriptionStartEventFor<'ai.streamTranscribe'>;

/**
 * Event passed to telemetry integrations when transcription completes.
 *
 * Raw audio is intentionally not included.
 */
type TranscriptionEndEventFor<OPERATION_ID extends string> = {
  /** Unique identifier for this transcription call. */
  readonly callId: string;

  /** Identifies the operation type (`ai.transcribe` or `ai.streamTranscribe`). */
  readonly operationId: OPERATION_ID;

  /** The provider identifier. */
  readonly provider: string;

  /** The specific model identifier. */
  readonly modelId: string;

  /** Metadata about the input audio. */
  readonly audio: {
    readonly byteLength: OPERATION_ID extends 'ai.transcribe'
      ? number | undefined
      : number;
    readonly mediaType: OPERATION_ID extends 'ai.transcribe'
      ? string | undefined
      : string;
  };

  /** The complete transcript. */
  readonly text: string;

  /** Transcript segments with timing information, retaining provider behavior. */
  readonly segments: Array<{
    readonly text: string;
    readonly startSecond: number;
    readonly endSecond: number;
  }>;

  /** The detected language. */
  readonly language: string | undefined;

  /** The duration of the input audio, when available. */
  readonly durationInSeconds: number | undefined;

  /** Usage reported by the provider, when available. */
  readonly usage: JSONObject | undefined;

  /** Warnings from the transcription model. */
  readonly warnings: Array<Warning>;

  /** Optional provider-specific metadata. */
  readonly providerMetadata: ProviderMetadata | undefined;

  /** Response metadata from the provider. */
  readonly response: TranscriptionModelResponseMetadata;
};

export type TranscriptionEndEvent =
  TranscriptionEndEventFor<'ai.transcribe'> & {
    /** Word timings returned by the provider, whether requested or returned by default. */
    readonly words?: Array<{
      readonly text: string;
      readonly startSecond: number;
      readonly endSecond: number;
    }>;
  };

export type StreamTranscriptionEndEvent =
  TranscriptionEndEventFor<'ai.streamTranscribe'>;
