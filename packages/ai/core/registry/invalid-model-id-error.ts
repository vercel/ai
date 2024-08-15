import { AISDKError } from '@ai-sdk/provider';

const name = 'AI_InvalidModelIdError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

export class InvalidModelIdError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  readonly id: string;

  constructor({
    id,
    message = `Invalid model id: ${id}`,
  }: {
    id: string;
    message?: string;
  }) {
    super({ name, message });

    this.id = id;
  }

  static isInstance(error: unknown): error is InvalidModelIdError {
    return AISDKError.hasMarker(error, marker);
  }

  /**
   * @deprecated use `isInstance` instead
   */
  static isInvalidModelIdError(error: unknown): error is InvalidModelIdError {
    return (
      error instanceof Error &&
      error.name === name &&
      typeof (error as InvalidModelIdError).id === 'string'
    );
  }

  /**
   * @deprecated Do not use this method. It will be removed in the next major version.
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      stack: this.stack,
      id: this.id,
    };
  }
}
