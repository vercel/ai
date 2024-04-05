import { getErrorMessage } from '../util';

export class InvalidToolArgumentsAIError extends Error {
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

    this.name = 'InvalidToolArgumentsAIError';

    this.toolArgs = toolArgs;
    this.toolName = toolName;
    this.cause = cause;
  }

  static isInvalidToolArgumentsError(
    error: unknown,
  ): error is InvalidToolArgumentsAIError {
    return (
      error instanceof Error &&
      error.name === 'InvalidToolArgumentsAIError' &&
      typeof (error as InvalidToolArgumentsAIError).toolName === 'string' &&
      typeof (error as InvalidToolArgumentsAIError).toolArgs === 'string'
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
