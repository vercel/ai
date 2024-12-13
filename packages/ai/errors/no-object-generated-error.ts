import { AISDKError } from '@ai-sdk/provider';

const name = 'AI_NoObjectGeneratedError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

/**
Thrown when no object could be generated. This can have several causes:

- The model failed to generate a response.
- The model generated a response that could not be parsed.
- The model generated a response that could not be validated against the schema.
 */
export class NoObjectGeneratedError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  constructor({ message = 'No object generated.' }: { message?: string } = {}) {
    super({ name, message });
  }

  static isInstance(error: unknown): error is NoObjectGeneratedError {
    return AISDKError.hasMarker(error, marker);
  }
}
