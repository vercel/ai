import { AISDKError } from '@ai-sdk/provider';
import type { GenerateImageCall } from '../generate-image/generate-image-result';
import type { ImageModelResponseMetadata } from '../types/image-model-response-metadata';

const name = 'AI_NoImageGeneratedError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

/**
 * Thrown when completed image model calls return no images.
 */
export class NoImageGeneratedError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  /**
   * The response metadata for each call.
   */
  readonly responses: Array<ImageModelResponseMetadata> | undefined;

  /**
   * The results of the completed image model calls.
   */
  readonly calls: Array<GenerateImageCall> | undefined;

  constructor({
    message = 'No image generated.',
    cause,
    responses,
    calls,
  }: {
    message?: string;
    cause?: Error;
    responses?: Array<ImageModelResponseMetadata>;
    calls?: Array<GenerateImageCall>;
  }) {
    super({ name, message, cause });

    this.responses = responses;
    this.calls = calls;
  }

  static isInstance(error: unknown): error is NoImageGeneratedError {
    return AISDKError.hasMarker(error, marker);
  }
}
