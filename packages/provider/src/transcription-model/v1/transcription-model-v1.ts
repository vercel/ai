import { JSONValue } from '../../json-value';
import { TranscriptionModelV1CallOptions } from './transcription-model-v1-call-options';
import { TranscriptionModelV1CallWarning } from './transcription-model-v1-call-warning';

type GeneratedTranscript = {
  /**
   * The complete transcribed text from the audio.
   */
  text: string;

  /**
   * Array of transcript segments with timing information.
   * Each segment represents a portion of the transcribed text with start and end times.
   */
  segments: Array<{
    /**
     * The text content of this segment.
     */
    text: string;
    /**
     * The start time of this segment in seconds.
     */
    startSecond: number;
    /**
     * The end time of this segment in seconds.
     */
    endSecond: number;
  }>;

  /**
   * The detected language of the audio content, as an ISO-639-1 code (e.g., 'en' for English).
   * May be undefined if the language couldn't be detected.
   */
  language: string | undefined;

  /**
   * The total duration of the audio file in seconds.
   * May be undefined if the duration couldn't be determined.
   */
  durationInSeconds: number | undefined;

  /**
   * The MIME type of the audio file that was transcribed (e.g., 'audio/wav').
   */
  mimeType: string;
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

    /**
Provider metadata for telemetry and debugging purposes.
     */
    providerMetadata: Record<string, JSONValue>;
  }>;
};
