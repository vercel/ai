import type {
  Experimental_SpeechTranslationModelV4Usage,
  JSONObject,
  SharedV4ProviderMetadata,
} from '@ai-sdk/provider';
import type { SpeechTranslationModelResponseMetadata } from '../types/speech-translation-model-response-metadata';
import type { Warning } from '../types/warning';
import type { AsyncIterableStream } from '../util/async-iterable-stream';

/**
 * Stream parts emitted by `experimental_streamTranslate`.
 *
 * Speech translation model stream parts are passed through unchanged, except
 * for `stream-start`, `response-metadata`, and `finish`, which are consumed
 * internally and surfaced via the result promises.
 */
export type TranslationStreamPart =
  | {
      /**
       * Translated audio chunk in the target language.
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
       * Append-only translated text delta.
       */
      type: 'output-text-delta';
      id?: string;
      delta: string;
      providerMetadata?: SharedV4ProviderMetadata;
    }
  | {
      /**
       * Final translated text for a provider-defined segment or utterance.
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
       * Raw provider chunks if enabled via `includeRawChunks`.
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

export interface StreamTranslationResult {
  /**
   * The final source-language transcript of the input audio.
   */
  readonly sourceText: PromiseLike<string>;

  /**
   * The final translated text in the target language.
   *
   * May resolve to an empty string for providers that produce only audio
   * output.
   */
  readonly translationText: PromiseLike<string>;

  /**
   * The duration of the source audio in seconds, if available.
   */
  readonly durationInSeconds: PromiseLike<number | undefined>;

  /**
   * Usage information for the translation call, if reported by the provider.
   */
  readonly usage: PromiseLike<
    Experimental_SpeechTranslationModelV4Usage | undefined
  >;

  /**
   * Warnings for the call, e.g. unsupported settings.
   */
  readonly warnings: PromiseLike<Array<Warning>>;

  /**
   * Response metadata.
   */
  readonly response: PromiseLike<SpeechTranslationModelResponseMetadata>;

  /**
   * Additional provider-specific metadata.
   */
  readonly providerMetadata: PromiseLike<Record<string, JSONObject>>;

  /**
   * Full stream of translation parts.
   *
   * This is a single-consumer live stream and can only be accessed once.
   * Access it before any result promise when both stream parts and final
   * results are needed; accessing a result promise first consumes the stream
   * internally and makes `fullStream` unavailable.
   */
  readonly fullStream: AsyncIterableStream<TranslationStreamPart>;
}
