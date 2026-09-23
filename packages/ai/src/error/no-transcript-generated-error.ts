import { AISDKError, type SharedV4ProviderMetadata } from '@ai-sdk/provider';
import type { TranscriptionModelResponseMetadata } from '../types/transcription-model-response-metadata';

const name = 'AI_NoTranscriptGeneratedError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

/**
 * Error that is thrown when no transcript was generated.
 */
export class NoTranscriptGeneratedError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  readonly responses: Array<TranscriptionModelResponseMetadata>;
  readonly providerMetadata: SharedV4ProviderMetadata | undefined;

  constructor({
    message = 'No transcript generated.',
    cause,
    responses,
    providerMetadata,
  }: {
    message?: string;
    cause?: unknown;
    responses: Array<TranscriptionModelResponseMetadata>;
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

  static isInstance(error: unknown): error is NoTranscriptGeneratedError {
    return AISDKError.hasMarker(error, marker);
  }
}
