import { AISDKError, type SharedV4ProviderMetadata } from '@ai-sdk/provider';
import type { SpeechModelResponseMetadata } from '../types/speech-model-response-metadata';

const name = 'AI_NoSpeechGeneratedError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

/**
 * Error that is thrown when no speech audio was generated.
 */
export class NoSpeechGeneratedError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  readonly responses: Array<SpeechModelResponseMetadata>;
  readonly providerMetadata: SharedV4ProviderMetadata | undefined;

  constructor({
    message = 'No speech audio generated.',
    cause,
    responses,
    providerMetadata,
  }: {
    message?: string;
    cause?: unknown;
    responses: Array<SpeechModelResponseMetadata>;
    providerMetadata?: SharedV4ProviderMetadata;
  }) {
    super({
      name,
      message,
      cause,
    });

    this.responses = responses;
    this.providerMetadata = providerMetadata;
  }

  static isInstance(error: unknown): error is NoSpeechGeneratedError {
    return AISDKError.hasMarker(error, marker);
  }
}
