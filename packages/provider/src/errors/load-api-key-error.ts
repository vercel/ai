import { AISDKError } from './ai-sdk-error';

const marker = Symbol.for('vercel.ai.error.load-api-key-error');

export class LoadAPIKeyError extends AISDKError {
  private readonly [marker] = true; // used in isInstance

  constructor({ message }: { message: string }) {
    super({
      name: 'AI_LoadAPIKeyError',
      message,
    });
  }

  static isInstance(error: unknown): error is LoadAPIKeyError {
    return (
      error != null &&
      (error instanceof AISDKError ||
        (typeof error === 'object' &&
          marker in error &&
          typeof error[marker] === 'boolean' &&
          error[marker] === true))
    );
  }

  /**
   * @deprecated Use isInstance instead.
   */
  static isLoadAPIKeyError(error: unknown): error is LoadAPIKeyError {
    return error instanceof Error && error.name === 'AI_LoadAPIKeyError';
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
    };
  }
}
