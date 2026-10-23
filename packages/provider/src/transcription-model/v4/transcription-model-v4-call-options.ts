import type { JSONObject } from '../../json-value/json-value';

type TranscriptionModelV4ProviderOptions = Record<string, JSONObject>;

/**
 * Timing detail to request from a transcription model.
 * `word` is word highlighting. `segment` is caption-sized phrases.
 */
export type TranscriptionModelV4TimestampGranularity = 'word' | 'segment';

export type TranscriptionModelV4CallOptions = {
  /**
   * Audio data to transcribe.
   * Accepts a `Uint8Array` or `string`, where `string` is a base64 encoded audio file.
   */
  audio: Uint8Array | string;

  /**
   * The IANA media type of the audio data.
   *
   * @see https://www.iana.org/assignments/media-types/media-types.xhtml
   */
  mediaType: string;

  /**
   * Word and segment timings to request.
   *
   * Adapters map this onto the provider's native control when that provider
   * option is omitted. An explicit provider option wins. Adapters warn when
   * they cannot provide a requested granularity.
   */
  timestampGranularities?: Array<TranscriptionModelV4TimestampGranularity>;

  /**
   * Additional provider-specific options that are passed through to the provider
   * as body parameters.
   *
   * The outer record is keyed by the provider name, and the inner
   * record is keyed by the provider-specific metadata key.
   * ```ts
   * {
   * "openai": {
   * "timestampGranularities": ["word"]
   * }
   * }
   * ```
   */
  providerOptions?: TranscriptionModelV4ProviderOptions;

  /**
   * Abort signal for cancelling the operation.
   */
  abortSignal?: AbortSignal;

  /**
   * Additional HTTP headers to be sent with the request.
   * Only applicable for HTTP-based providers.
   */
  headers?: Record<string, string | undefined>;
};
