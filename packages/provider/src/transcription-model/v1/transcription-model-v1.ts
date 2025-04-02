import { TranscriptionModelV1CallOptions } from './transcription-model-v1-call-options';
import { TranscriptionModelV1CallWarning } from './transcription-model-v1-call-warning';

/**
Transcription model specification version 1.
 */
export type TranscriptionModelV1 = {
  /**
The transcription model must specify which transcription model interface
version it implements. This will allow us to evolve the transcription
model interface and retain backwards compatibility. The different
implementation versions can be handled as a discriminated union
on our side.
   */
  readonly specificationVersion: 'v1';

  /**
Name of the provider for logging purposes.
   */
  readonly provider: string;

  /**
Provider-specific model ID for logging purposes.
   */
  readonly modelId: string;

  /**
Generates an array of transcripts.
   */
  doGenerate(options: TranscriptionModelV1CallOptions): PromiseLike<{
    /**
Generated transcript as a string.
The transcript contains the text that was transcribed from the audio.
     */
    transcript: {
      text: string;
      segments: Array<{
        id: string;
        start: number;
        end: number;
        text: string;
      }>;
      language?: string;
      duration?: number;
    };

    /**
Warnings for the call, e.g. unsupported settings.
     */
    warnings: Array<TranscriptionModelV1CallWarning>;

    /**
Response information for telemetry and debugging purposes.
     */
    response: {
      /**
Timestamp for the start of the generated response.
      */
      timestamp: Date;

      /**
The ID of the response model that was used to generate the response.
      */
      modelId: string;

      /**
Response headers.
      */
      headers: Record<string, string> | undefined;
    };
  }>;
};
