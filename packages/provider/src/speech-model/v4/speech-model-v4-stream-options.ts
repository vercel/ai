import type { JSONObject } from '../../json-value/json-value';

type SpeechModelV4ProviderOptions = Record<string, JSONObject>;

/**
 * Options for a speech model stream call.
 */
export type SpeechModelV4StreamOptions = {
  /**
   * Text to convert to speech, as a stream of text deltas.
   *
   * Deltas are synthesized in order. Providers with an incremental text
   * input transport forward deltas as they arrive; providers that only
   * accept complete text read the stream to completion before synthesis.
   * The end of the stream signals the end of the input text.
   *
   * The provider owns the stream once `doStream` is called. It must release
   * it in every terminal path: cancel it (or its locked reader) when the
   * abort signal fires, when the consumer cancels the returned stream, when
   * setup fails before or after the stream is locked, and when the provider
   * fails. Leaving it unread and uncancelled keeps the caller's text producer
   * running indefinitely. After a normal finish the stream is fully read.
   */
  text: ReadableStream<string>;

  /**
   * The voice to use for speech synthesis.
   * This is provider-specific and may be a voice ID, name, or other identifier.
   */
  voice?: string;

  /**
   * The desired output format for the audio, e.g. "mp3" or "pcm_24000".
   * Supported values are provider-specific.
   */
  outputFormat?: string;

  /**
   * Instructions for the speech generation e.g. "Speak in a slow and steady tone".
   */
  instructions?: string;

  /**
   * The speed of the speech generation.
   */
  speed?: number;

  /**
   * The language for speech generation. This should be an ISO 639-1 language code (e.g. "en", "es", "fr")
   * or "auto" for automatic language detection. Provider support varies.
   */
  language?: string;

  /**
   * Additional provider-specific options that are passed through to the provider.
   *
   * The outer record is keyed by the provider name, and the inner record is keyed
   * by provider-specific option names.
   */
  providerOptions?: SpeechModelV4ProviderOptions;

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
