import { AISDKError } from '@ai-sdk/provider';
import { ImageModelResponseMetadata } from '../core/types/image-model-response-metadata';

const name = 'AI_NoImageGeneratedError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

/**
Thrown when no image could be generated. This can have multiple causes:

- The model failed to generate a response.
- The model generated a response that could not be parsed.
 */
export class NoImageGeneratedError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  /**
  The response metadata.
   */
  readonly response: ImageModelResponseMetadata | undefined;

  constructor({
    message = 'No image generated.',
    cause,
    response,
  }: {
    message?: string;
    cause?: Error;
    response: ImageModelResponseMetadata;
  }) {
    super({ name, message, cause });

    this.response = response;
  }

  static isInstance(error: unknown): error is NoImageGeneratedError {
    return AISDKError.hasMarker(error, marker);
  }
}
