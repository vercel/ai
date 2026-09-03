import {
  AISDKError,
  type Experimental_SpeechTranslationModelV4Usage,
  type SharedV4ProviderMetadata,
} from '@ai-sdk/provider';
import type { SpeechTranslationModelResponseMetadata } from '../types/speech-translation-model-response-metadata';

const name = 'AI_NoTranslationGeneratedError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

/**
 * Error that is thrown when no translation was generated.
 */
export class NoTranslationGeneratedError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  readonly response: SpeechTranslationModelResponseMetadata;
  readonly usage: Experimental_SpeechTranslationModelV4Usage | undefined;
  readonly providerMetadata: SharedV4ProviderMetadata | undefined;

  constructor({
    message = 'No translation generated.',
    cause,
    response,
    usage,
    providerMetadata,
  }: {
    message?: string;
    cause?: unknown;
    response: SpeechTranslationModelResponseMetadata;
    usage?: Experimental_SpeechTranslationModelV4Usage;
    providerMetadata?: SharedV4ProviderMetadata;
  }) {
    super({
      name,
      message,
      cause,
    });

    this.response = response;
    this.usage = usage;
    this.providerMetadata = providerMetadata;
  }

  static isInstance(error: unknown): error is NoTranslationGeneratedError {
    return AISDKError.hasMarker(error, marker);
  }
}
