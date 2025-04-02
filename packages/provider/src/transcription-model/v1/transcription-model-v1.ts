import { TranscriptionModelV1CallOptions } from './transcription-model-v1-call-options';
import { TranscriptionModelV1CallWarning } from './transcription-model-v1-call-warning';

type GeneratedTranscript = {
  text: string;
  segments: Array<{
    text: string;
    startSecond: number;
    endSecond: number;
  }>;
  language: string | undefined;
  durationInSeconds: number | undefined;
};

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
Generates a transcript.
   */
  doGenerate(options: TranscriptionModelV1CallOptions): PromiseLike<{
    /**
Generated transcript as an object that contains the text that was transcribed from the audio,
the segments of the transcript, the language of the transcript, and the duration of the transcript.
     */
    transcript: GeneratedTranscript;

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
