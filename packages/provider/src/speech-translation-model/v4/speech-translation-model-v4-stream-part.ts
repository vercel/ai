import type { JSONObject } from '../../json-value/json-value';
import type { SharedV4Headers } from '../../shared';
import type { SharedV4ProviderMetadata } from '../../shared/v4/shared-v4-provider-metadata';
import type { SharedV4Warning } from '../../shared/v4/shared-v4-warning';
import type { SpeechTranslationModelV4Usage } from './speech-translation-model-v4-usage';

export type SpeechTranslationModelV4StreamPart =
  | {
      /**
       * Stream start event with warnings for the call, e.g. unsupported settings.
       */
      type: 'stream-start';
      warnings: Array<SharedV4Warning>;
    }
  | {
      /**
       * Output audio chunk.
       *
       * `Uint8Array` chunks contain raw audio bytes. `string` chunks contain
       * base64-encoded raw audio bytes.
       */
      type: 'audio';
      id?: string;
      audio: Uint8Array | string;
      providerMetadata?: SharedV4ProviderMetadata;
    }
  | {
      /**
       * Append-only output text delta.
       *
       * Output text is append-only: providers stream `output-text-delta`
       * parts and finalize per-utterance with `output-text-final`. There is
       * no partial/revision part for output text by design for now.
       */
      type: 'output-text-delta';
      id?: string;
      delta: string;
      providerMetadata?: SharedV4ProviderMetadata;
    }
  | {
      /**
       * Final output text for a provider-defined segment or utterance.
       *
       * Output text is append-only: providers stream `output-text-delta`
       * parts and finalize per-utterance with `output-text-final`. There is
       * no partial/revision part for output text by design for now.
       */
      type: 'output-text-final';
      id?: string;
      text: string;
      providerMetadata?: SharedV4ProviderMetadata;
    }
  | {
      /**
       * Append-only source transcript delta.
       */
      type: 'source-transcript-delta';
      id?: string;
      delta: string;
      providerMetadata?: SharedV4ProviderMetadata;
    }
  | {
      /**
       * Non-final source transcript text. The text may be revised by later parts.
       */
      type: 'source-transcript-partial';
      id?: string;
      text: string;
      startSecond?: number;
      endSecond?: number;
      channelIndex?: number;
      providerMetadata?: SharedV4ProviderMetadata;
    }
  | {
      /**
       * Final source transcript text for a provider-defined segment or utterance.
       */
      type: 'source-transcript-final';
      id?: string;
      text: string;
      startSecond?: number;
      endSecond?: number;
      channelIndex?: number;
      providerMetadata?: SharedV4ProviderMetadata;
    }
  | {
      /**
       * Metadata for the response, emitted once available.
       */
      type: 'response-metadata';
      timestamp?: Date;
      modelId?: string;
      headers?: SharedV4Headers;
      body?: unknown;
    }
  | {
      /**
       * Metadata that is available after the stream is finished.
       */
      type: 'finish';

      /**
       * The final source-language transcript of the input audio.
       */
      sourceText: string;

      /**
       * The final output text. May be an empty string for providers that
       * produce only audio output.
       */
      outputText: string;

      /**
       * The duration of the source audio in seconds, if available.
       */
      durationInSeconds?: number;

      /**
       * Usage information for the call, if reported by the provider.
       */
      usage?: SpeechTranslationModelV4Usage;

      /**
       * Additional provider-specific metadata.
       */
      providerMetadata?: Record<string, JSONObject>;
    }
  | {
      /**
       * Raw provider chunks if enabled.
       */
      type: 'raw';
      rawValue: unknown;
    }
  | {
      /**
       * Error parts are streamed, allowing for multiple errors.
       */
      type: 'error';
      error: unknown;
    };
