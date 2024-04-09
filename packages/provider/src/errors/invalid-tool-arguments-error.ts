import { getErrorMessage } from './get-error-message';

export class InvalidToolArgumentsError extends Error {
  readonly toolName: string;
  readonly toolArgs: string;
  readonly cause: unknown;

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
    super(message);

    this.name = 'AI_InvalidToolArgumentsError';

    this.toolArgs = toolArgs;
    this.toolName = toolName;
    this.cause = cause;
  }

  static isInvalidToolArgumentsError(
    error: unknown,
  ): error is InvalidToolArgumentsError {
    return (
      error instanceof Error &&
      error.name === 'AI_InvalidToolArgumentsError' &&
      typeof (error as InvalidToolArgumentsError).toolName === 'string' &&
      typeof (error as InvalidToolArgumentsError).toolArgs === 'string'
    );
  }

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
