import { AISDKError } from '@ai-sdk/provider';
import type { SpeechTranslationModelResponseMetadata } from '../types/speech-translation-model-response-metadata';

const name = 'AI_NoTranslationGeneratedError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

/**
 * Error that is thrown when no translation was generated.
 */
export class NoTranslationGeneratedError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  readonly responses: Array<SpeechTranslationModelResponseMetadata>;

  constructor(options: {
    responses: Array<SpeechTranslationModelResponseMetadata>;
  }) {
    super({
      name,
      message: 'No translation generated.',
    });

    this.responses = options.responses;
  }

  static isInstance(error: unknown): error is NoTranslationGeneratedError {
    return AISDKError.hasMarker(error, marker);
  }
}
