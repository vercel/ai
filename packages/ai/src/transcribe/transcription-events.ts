import type { JSONObject, SharedV4AudioFormat } from '@ai-sdk/provider';
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
   * Metadata about the input audio. The byte length is known immediately for
   * non-streaming transcription and is reported on the end event for streams.
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
  TranscriptionStartEventFor<'ai.transcribe'>;

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
    readonly byteLength: number;
    readonly mediaType: string;
  };

  /** The complete transcript. */
  readonly text: string;

  /** Transcript segments with timing information. */
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

export type TranscriptionEndEvent = TranscriptionEndEventFor<'ai.transcribe'>;

export type StreamTranscriptionEndEvent =
  TranscriptionEndEventFor<'ai.streamTranscribe'>;
