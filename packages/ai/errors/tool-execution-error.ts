import { AISDKError, getErrorMessage, JSONValue } from '@ai-sdk/provider';

const name = 'AI_ToolExecutionError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

export class ToolExecutionError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  readonly toolName: string;
  readonly toolArgs: JSONValue | unknown;
  readonly toolCallId: string;

  constructor({
    toolArgs,
    toolName,
    toolCallId,
    cause,
    message = `Error executing tool ${toolName}: ${getErrorMessage(cause)}`,
  }: {
    message?: string;
    toolArgs: JSONValue | unknown;
    toolName: string;
    toolCallId: string;
    cause: unknown;
  }) {
    super({ name, message, cause });

    this.toolArgs = toolArgs;
    this.toolName = toolName;
    this.toolCallId = toolCallId;
  }

  static isInstance(error: unknown): error is ToolExecutionError {
    return AISDKError.hasMarker(error, marker);
  }
}
