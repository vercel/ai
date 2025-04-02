import { AISDKError } from '@ai-sdk/provider';
import { TranscriptModelResponseMetadata } from '../core/types/transcript-model-response-metadata';

/**
Error that is thrown when no transcript was generated.
 */
export class NoTranscriptGeneratedError extends AISDKError {
  readonly responses: Array<TranscriptModelResponseMetadata>;

  constructor(options: {
    responses: Array<TranscriptModelResponseMetadata>;
  }) {
    super({
      name: 'AI_NoTranscriptGeneratedError',
      message: 'No transcript generated.',
    });

    this.responses = options.responses;
  }
} 