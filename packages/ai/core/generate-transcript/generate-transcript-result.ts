import { JSONValue } from '@ai-sdk/provider';
import { TranscriptionWarning } from '../types/transcription-model';
import { TranscriptionModelResponseMetadata } from '../types/transcription-model-response-metadata';
/**
 * Represents a transcript generated from audio content.
 */
export type GeneratedTranscript = {
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
The result of a `generateTranscript` call.
It contains the transcript and additional information.
 */
export interface GenerateTranscriptResult {
  /**
  The transcript that was generated.
   */
  readonly transcript: GeneratedTranscript;

  /**
  Warnings for the call, e.g. unsupported settings.
     */
  readonly warnings: Array<TranscriptionWarning>;

  /**
  Response metadata from the provider. There may be multiple responses if we made multiple calls to the model.
   */
  readonly responses: Array<TranscriptionModelResponseMetadata>;

  /**
  Provider metadata from the provider.
   */
  readonly providerMetadata: Record<string, JSONValue>;
}
