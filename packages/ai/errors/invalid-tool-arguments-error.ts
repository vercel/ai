import { AISDKError, getErrorMessage } from '@ai-sdk/provider';

const name = 'AI_InvalidToolArgumentsError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

export class InvalidToolArgumentsError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  readonly toolName: string;
  readonly toolArgs: string;

  constructor({
    toolArgs,
    toolName,
    cause,
    message = `Invalid arguments for tool ${toolName}: ${getErrorMessage(
      cause,
    )}`,
  }: {
    message?: string;
    toolArgs: string;
    toolName: string;
    cause: unknown;
  }) {
    super({ name, message, cause });

    this.toolArgs = toolArgs;
    this.toolName = toolName;
  }

  static isInstance(error: unknown): error is InvalidToolArgumentsError {
    return AISDKError.hasMarker(error, marker);
  }

  /**
   * @deprecated use `isInstance` instead
   */
  static isInvalidToolArgumentsError(
    error: unknown,
  ): error is InvalidToolArgumentsError {
    return (
      error instanceof Error &&
      error.name === name &&
      typeof (error as InvalidToolArgumentsError).toolName === 'string' &&
      typeof (error as InvalidToolArgumentsError).toolArgs === 'string'
    );
  }

  /**
   * @deprecated Do not use this method. It will be removed in the next major version.
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      cause: this.cause,
      stack: this.stack,

      toolName: this.toolName,
      toolArgs: this.toolArgs,
    };
  }
}
