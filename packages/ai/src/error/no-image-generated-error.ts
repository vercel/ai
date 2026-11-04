import { AISDKError } from '@ai-sdk/provider';
import type { GenerateImageCall } from '../generate-image/generate-image-result';
import type { ImageModelResponseMetadata } from '../types/image-model-response-metadata';

const name = 'AI_NoImageGeneratedError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

/**
 * Thrown when no image could be generated. This can have multiple causes:
 *
 * - The model failed to generate a response.
 * - The model generated a response that could not be parsed.
 */
export class NoImageGeneratedError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  /**
   * The results of the underlying image model calls.
   */
  readonly calls: Array<GenerateImageCall> | undefined;

  /**
   * The response metadata for each call.
   */
  readonly responses: Array<ImageModelResponseMetadata> | undefined;

  constructor({
    message = 'No image generated.',
    cause,
    calls,
    responses,
  }: {
    message?: string;
    cause?: Error;
    calls?: Array<GenerateImageCall>;
    responses?: Array<ImageModelResponseMetadata>;
  }) {
    super({ name, message, cause });

    this.calls = calls;
    this.responses = responses;
  }

  static isInstance(error: unknown): error is NoImageGeneratedError {
    return AISDKError.hasMarker(error, marker);
  }
}
