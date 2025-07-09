import { AISDKError } from '@ai-sdk/provider';
<<<<<<< HEAD:packages/ai/errors/no-speech-generated-error.ts
import { SpeechModelResponseMetadata } from '../core/types/speech-model-response-metadata';
=======
import { SpeechModelResponseMetadata } from '../types/speech-model-response-metadata';
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9:packages/ai/src/error/no-speech-generated-error.ts

/**
Error that is thrown when no speech audio was generated.
 */
export class NoSpeechGeneratedError extends AISDKError {
  readonly responses: Array<SpeechModelResponseMetadata>;

  constructor(options: { responses: Array<SpeechModelResponseMetadata> }) {
    super({
      name: 'AI_NoSpeechGeneratedError',
      message: 'No speech audio generated.',
    });

    this.responses = options.responses;
  }
}
