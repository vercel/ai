import type { JSONObject } from '../../json-value/json-value';
import type { SharedV4AudioFormat } from '../../shared';

type TranscriptionModelV4ProviderOptions = Record<string, JSONObject>;

export type TranscriptionModelV4StreamOptions = {
  /**
   * Audio chunks to transcribe.
   *
   * `Uint8Array` chunks contain raw audio bytes. `string` chunks contain
   * base64-encoded raw audio bytes.
   */
  audio: ReadableStream<Uint8Array | string>;

  /**
   * The input audio format for the raw audio chunks.
   */
  inputAudioFormat: SharedV4AudioFormat;

  /**
   * Additional provider-specific options that are passed through to the provider.
   *
   * The outer record is keyed by the provider name, and the inner record is keyed
   * by provider-specific option names.
   */
  providerOptions?: TranscriptionModelV4ProviderOptions;

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
