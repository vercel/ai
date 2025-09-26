import { AISDKError } from '@ai-sdk/provider';
import { VideoModelResponseMetadata } from '../types/video-model-response-metadata';

const name = 'AI_NoVideoGeneratedError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

/**
Thrown when no video could be generated. This can have multiple causes:

- The model failed to generate a response.
- The model generated a response that could not be parsed.
 */
export class NoVideoGeneratedError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  /**
The response metadata for each call.
   */
  readonly responses: Array<VideoModelResponseMetadata> | undefined;

  constructor({
    message = 'No video generated.',
    cause,
    responses,
  }: {
    message?: string;
    cause?: Error;
    responses?: Array<VideoModelResponseMetadata>;
  }) {
    super({ name, message, cause });

    this.responses = responses;
  }

  static isInstance(error: unknown): error is NoVideoGeneratedError {
    return AISDKError.hasMarker(error, marker);
  }
}


