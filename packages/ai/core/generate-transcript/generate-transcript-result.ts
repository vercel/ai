import { GeneratedTranscript } from '../generate-transcript';
import { TranscriptionWarning } from '../types/transcription-model';
import { TranscriptionModelResponseMetadata } from '../types/transcription-model-response-metadata';

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
}
