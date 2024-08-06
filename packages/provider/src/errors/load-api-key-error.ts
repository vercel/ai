import { AISDKError } from './ai-sdk-error';

const name = 'AI_LoadAPIKeyError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

export class LoadAPIKeyError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  constructor({ message }: { message: string }) {
    super({ name, message });
  }

  static isInstance(error: unknown): error is LoadAPIKeyError {
    return AISDKError.hasMarker(error, marker);
  }

  /**
   * @deprecated Use isInstance instead.
   */
  static isLoadAPIKeyError(error: unknown): error is LoadAPIKeyError {
    return error instanceof Error && error.name === name;
  }
}
