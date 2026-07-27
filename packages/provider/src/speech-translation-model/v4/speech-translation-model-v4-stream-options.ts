import type { JSONObject } from '../../json-value/json-value';

type SpeechTranslationModelV4ProviderOptions = Record<string, JSONObject>;

/**
 * Options for a speech translation model stream call.
 */
export type SpeechTranslationModelV4StreamOptions = {
  /**
   * Source audio chunks to transform.
   *
   * `Uint8Array` chunks contain raw audio bytes. `string` chunks contain
   * base64-encoded raw audio bytes.
   */
  audio: ReadableStream<Uint8Array | string>;

  /**
   * The input audio format for the raw audio chunks.
   */
  inputAudioFormat: {
    /**
     * Audio format type, e.g. `audio/pcm`, `audio/pcmu`, or `audio/pcma`.
     */
    type: string;

    /**
     * Sample rate in Hz. Only applicable for formats that require a rate.
     */
    rate?: number;
  };

  /**
   * The language to produce output audio and text in, as a BCP-47-style
   * language tag (e.g. `en`, `es`, `fr-CA`). Supported values are
   * provider-specific and validated by the provider.
   */
  targetLanguage: string;

  /**
   * The language of the source audio, as a BCP-47-style language tag.
   * When absent, providers should auto-detect the source language.
   */
  sourceLanguage?: string;

  /**
   * The desired audio format for output audio chunks.
   * When absent, the provider default output format is used.
   */
  outputAudioFormat?: {
    /**
     * Audio format type, e.g. `audio/pcm`, `audio/pcmu`, or `audio/pcma`.
     */
    type: string;

    /**
     * Sample rate in Hz. Only applicable for formats that require a rate.
     */
    rate?: number;
  };

  /**
   * Additional provider-specific options that are passed through to the provider.
   *
   * The outer record is keyed by the provider name, and the inner record is keyed
   * by provider-specific option names.
   */
  providerOptions?: SpeechTranslationModelV4ProviderOptions;

  /**
   * Abort signal for cancelling the operation.
   */
  abortSignal?: AbortSignal;

  /**
   * Additional HTTP headers to be sent with the request.
   * Only applicable for HTTP/WebSocket-based providers that support headers.
   */
  headers?: Record<string, string | undefined>;

  /**
   * When true, providers should include raw provider chunks in the stream.
   */
  includeRawChunks?: boolean;
};
