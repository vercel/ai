import { AISDKError } from '@ai-sdk/provider';
import type { GenerateImageCall } from '../generate-image/generate-image-result';
import type { GeneratedFile } from '../generate-text/generated-file';

const name = 'AI_ImageGenerationError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

/**
 * A failed underlying image model call.
 */
export interface ImageGenerationFailedCall {
  /**
   * The zero-based index of the split image model call.
   */
  readonly callIndex: number;

  /**
   * The error thrown by the image model call.
   */
  readonly error: unknown;
}

/**
 * Thrown when one or more split image model calls fail.
 *
 * Successful calls are preserved so their images and metadata can be
 * recovered without repeating completed generation work.
 */
export class ImageGenerationError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  /**
   * Images returned by successful image model calls.
   */
  readonly images: Array<GeneratedFile>;

  /**
   * Results from successful image model calls.
   */
  readonly calls: Array<GenerateImageCall>;

  /**
   * Errors from failed split image model calls.
   */
  readonly failedCalls: Array<ImageGenerationFailedCall>;

  constructor({
    calls,
    failedCalls,
  }: {
    calls: Array<GenerateImageCall>;
    failedCalls: Array<ImageGenerationFailedCall>;
  }) {
    super({
      name,
      message: `Image generation failed for ${failedCalls.length} ${
        failedCalls.length === 1 ? 'call' : 'calls'
      }.`,
      cause: failedCalls[0]?.error,
    });

    this.images = calls.flatMap(call => call.images);
    this.calls = calls;
    this.failedCalls = failedCalls;
  }

  static isInstance(error: unknown): error is ImageGenerationError {
    return AISDKError.hasMarker(error, marker);
  }
}
