import type { JSONObject } from '@ai-sdk/provider';
import type { ProviderOptions } from '@ai-sdk/provider-utils';
import type { ProviderMetadata } from '../types';
import type { SpeechModelResponseMetadata } from '../types/speech-model-response-metadata';
import type { Warning } from '../types/warning';

/**
 * Event passed to telemetry integrations when speech generation begins.
 */
export type GenerateSpeechStartEvent = {
  /** Unique identifier for this speech generation call. */
  readonly callId: string;

  /** Identifies the operation type (`ai.generateSpeech`). */
  readonly operationId: 'ai.generateSpeech';

  /** The provider identifier. */
  readonly provider: string;

  /** The specific model identifier. */
  readonly modelId: string;

  /** The text to convert to speech. */
  readonly text: string;

  /** The requested voice. */
  readonly voice: string | undefined;

  /** The requested output format. */
  readonly outputFormat: string | undefined;

  /** Additional speech instructions. */
  readonly instructions: string | undefined;

  /** The requested speech speed. */
  readonly speed: number | undefined;

  /** The requested language. */
  readonly language: string | undefined;

  /** Maximum number of retries for failed requests. */
  readonly maxRetries: number;

  /** Additional HTTP headers sent with the request. */
  readonly headers: Record<string, string> | undefined;

  /** Additional provider-specific options. */
  readonly providerOptions: ProviderOptions;
};

/**
 * Event passed to telemetry integrations when speech generation completes.
 *
 * Raw audio is intentionally not included. Integrations receive only its size,
 * media type, and format.
 */
export type GenerateSpeechEndEvent = {
  /** Unique identifier for this speech generation call. */
  readonly callId: string;

  /** Identifies the operation type (`ai.generateSpeech`). */
  readonly operationId: 'ai.generateSpeech';

  /** The provider identifier. */
  readonly provider: string;

  /** The specific model identifier. */
  readonly modelId: string;

  /** The text that was converted to speech. */
  readonly text: string;

  /** Metadata about the generated audio. */
  readonly audio: {
    readonly byteLength: number;
    readonly mediaType: string;
    readonly format: string;
  };

  /** Usage reported by the provider, when available. */
  readonly usage: JSONObject | undefined;

  /** Warnings from the speech model. */
  readonly warnings: Array<Warning>;

  /** Optional provider-specific metadata. */
  readonly providerMetadata: ProviderMetadata | undefined;

  /** Response metadata from the provider. */
  readonly response: SpeechModelResponseMetadata;
};
