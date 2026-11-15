import type { TranscriptionModelV4CallOptions } from './transcription-model-v4-call-options';
import type { TranscriptionModelV4Result } from './transcription-model-v4-result';
import type { TranscriptionModelV4StreamOptions } from './transcription-model-v4-stream-options';
import type { TranscriptionModelV4StreamResult } from './transcription-model-v4-stream-result';

/**
 * Transcription model specification version 4.
 */
export type TranscriptionModelV4 = {
  /**
   * The transcription model must specify which transcription model interface
   * version it implements. This will allow us to evolve the transcription
   * model interface and retain backwards compatibility. The different
   * implementation versions can be handled as a discriminated union
   * on our side.
   */
  readonly specificationVersion: 'v4';

  /**
   * Name of the provider for logging purposes.
   */
  readonly provider: string;

  /**
   * Provider-specific model ID for logging purposes.
   */
  readonly modelId: string;

  /**
   * Generates a transcript.
   */
  doGenerate(
    options: TranscriptionModelV4CallOptions,
  ): PromiseLike<TranscriptionModelV4Result>;

  /**
   * Optional native URL transcription. Its presence signals that HTTP(S)
   * audio URLs can be sent to the provider without downloading them locally.
   * The provider is responsible for fetching the audio; request headers are
   * for the provider API and are not forwarded to the audio host.
   *
   * Return `undefined` if the provider cannot fetch this URL and the SDK
   * should fall back to downloading it locally and calling `doGenerate`.
   * Throw for other errors (such as authentication or invalid audio).
   * Existing providers can continue implementing only `doGenerate`.
   */
  doGenerateFromUrl?(
    options: Omit<TranscriptionModelV4CallOptions, 'audio' | 'mediaType'> & {
      audio: URL;
    },
  ): PromiseLike<TranscriptionModelV4Result | undefined>;

  /**
   * Streams a transcript for live audio.
   *
   * Experimental: the streaming transcription contract may change in patch
   * releases while `experimental_streamTranscribe` is experimental. The
   * stream option/part/result types are exported with `Experimental_`
   * prefixes for this reason.
   */
  doStream?(
    options: TranscriptionModelV4StreamOptions,
  ): PromiseLike<TranscriptionModelV4StreamResult>;
};
