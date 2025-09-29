import { AISDKError, getErrorMessage } from '@ai-sdk/provider';

const name = 'AI_InvalidToolInputError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

export class InvalidToolInputError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  readonly toolName: string;
  readonly toolInput: string;

  constructor({
    toolInput,
    toolName,
  }: {
    toolInput: string;
    toolName: string;
  }) {
    super({ name });

    this.toolInput = toolInput;
    this.toolName = toolName;
  }

  static isInstance(error: unknown): error is InvalidToolInputError {
    return AISDKError.hasMarker(error, marker);
  }
}
