import { AISDKError, getErrorMessage } from '@ai-sdk/provider';

const name = 'AI_InvalidToolInputError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

export class InvalidToolInputError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  readonly toolName: string;
  readonly toolInput: string;

  /**
   * Whether the tool input contains unfinished structured JSON from a
   * generation step that ended because the output length limit was reached.
   */
  readonly truncated: boolean;

  constructor({
    toolInput,
    toolName,
    cause,
    truncated = false,
    message = `Invalid input for tool ${toolName}: ${getErrorMessage(cause)}`,
  }: {
    message?: string;
    toolInput: string;
    toolName: string;
    cause: unknown;
    truncated?: boolean;
  }) {
    super({ name, message, cause });

    this.toolInput = toolInput;
    this.toolName = toolName;
    this.truncated = truncated;
  }

  static isInstance(error: unknown): error is InvalidToolInputError {
    return AISDKError.hasMarker(error, marker);
  }
}
