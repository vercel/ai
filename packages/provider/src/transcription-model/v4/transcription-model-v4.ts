import { TranscriptionModelV4CallOptions } from './transcription-model-v4-call-options';
import { TranscriptionModelV4Result } from './transcription-model-v4-result';

/**
 * Transcription model specification version 3.
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
};
