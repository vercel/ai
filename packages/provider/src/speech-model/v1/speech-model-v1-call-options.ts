import { JSONValue } from '../../json-value/json-value';

type SpeechModelV1ProviderOptions = Record<string, Record<string, JSONValue>>;

export type SpeechModelV1CallOptions = {
  /**
   * Text to convert to speech.
   */
  text: string;

  /**
   * The voice to use for speech synthesis.
   * This is provider-specific and may be a voice ID, name, or other identifier.
   */
  voice?: string;

  /**
   * The desired output format for the audio e.g. "mp3", "wav", etc.
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
   * Additional provider-specific options that are passed through to the provider
   * as body parameters.
   *
   * The outer record is keyed by the provider name, and the inner
   * record is keyed by the provider-specific metadata key.
   * ```ts
   * {
   *   "openai": {}
   * }
   * ```
   */
  providerOptions?: SpeechModelV1ProviderOptions;

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
