import { JSONValue } from '@ai-sdk/provider';
import { TranscriptionWarning } from '../types/transcription-model';
import { TranscriptionModelResponseMetadata } from '../types/transcription-model-response-metadata';

export type GeneratedTranscript = {
  text: string;
  segments: Array<{
    text: string;
    startSecond: number;
    endSecond: number;
  }>;
  language: string | undefined;
  durationInSeconds: number | undefined;
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
