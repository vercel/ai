import { AISDKError } from '@ai-sdk/provider';
<<<<<<< HEAD:packages/ai/errors/no-transcript-generated-error.ts
import { TranscriptionModelResponseMetadata } from '../core/types/transcription-model-response-metadata';
=======
import { TranscriptionModelResponseMetadata } from '../types/transcription-model-response-metadata';
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9:packages/ai/src/error/no-transcript-generated-error.ts

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
