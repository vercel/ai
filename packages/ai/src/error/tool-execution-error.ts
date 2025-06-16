import { AISDKError, getErrorMessage, JSONValue } from '@ai-sdk/provider';

const name = 'AI_ToolExecutionError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

export class ToolExecutionError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  readonly toolName: string;
  readonly toolInput: JSONValue | unknown;
  readonly toolCallId: string;

  constructor({
    toolInput,
    toolName,
    toolCallId,
    cause,
    message = `Error executing tool ${toolName}: ${getErrorMessage(cause)}`,
  }: {
    message?: string;
    toolInput: JSONValue | unknown;
    toolName: string;
    toolCallId: string;
    cause: unknown;
  }) {
    super({ name, message, cause });

    this.toolInput = toolInput;
    this.toolName = toolName;
    this.toolCallId = toolCallId;
  }

  static isInstance(error: unknown): error is ToolExecutionError {
    return AISDKError.hasMarker(error, marker);
  }
}
