import { AISDKError } from '@ai-sdk/provider';
import type { ArtifactModelResponseMetadata } from '../types/artifact-model-response-metadata';

const name = 'AI_NoArtifactGeneratedError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

/**
 * Error thrown when an artifact model returns no artifact files.
 */
export class NoArtifactGeneratedError extends AISDKError {
  private readonly [symbol] = true;

  readonly responses: Array<ArtifactModelResponseMetadata>;

  constructor({
    message = 'No artifact generated.',
    cause,
    responses,
  }: {
    message?: string;
    cause?: unknown;
    responses: Array<ArtifactModelResponseMetadata>;
  }) {
    super({ name, message, cause });
    this.responses = responses;
  }

  static isInstance(error: unknown): error is NoArtifactGeneratedError {
    return AISDKError.hasMarker(error, marker);
  }
}
