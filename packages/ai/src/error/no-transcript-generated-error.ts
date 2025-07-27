import { AISDKError } from '@ai-sdk/provider';
import { TranscriptionModelResponseMetadata } from '../types/transcription-model-response-metadata';

/**
Error that is thrown when no transcript was generated.
 */
export class NoTranscriptGeneratedError extends AISDKError {
  readonly responses: Array<TranscriptionModelResponseMetadata>;

  constructor(options: {
    responses: Array<TranscriptionModelResponseMetadata>;
  }) {
    super({
      name: 'AI_NoTranscriptGeneratedError',
      message: 'No transcript generated.',
    });

    this.responses = options.responses;
  }
}
