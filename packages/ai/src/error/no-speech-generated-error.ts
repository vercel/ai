import { AISDKError } from '@ai-sdk/provider';
import { SpeechModelResponseMetadata } from '../types/speech-model-response-metadata';

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
