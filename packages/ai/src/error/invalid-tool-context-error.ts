import { AISDKError, getErrorMessage } from '@ai-sdk/provider';

const name = 'AI_InvalidToolContextError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

export class InvalidToolContextError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  readonly toolName: string;
  readonly toolContext: unknown;

  constructor({
    toolName,
    toolContext,
    cause,
    message = `Invalid context for tool ${toolName}: ${getErrorMessage(cause)}`,
  }: {
    message?: string;
    toolName: string;
    toolContext: unknown;
    cause: unknown;
  }) {
    super({ name, message, cause });

    this.toolName = toolName;
    this.toolContext = toolContext;
  }

  static isInstance(error: unknown): error is InvalidToolContextError {
    return AISDKError.hasMarker(error, marker);
  }
}
