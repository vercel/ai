import { AISDKError } from '@ai-sdk/provider';
import type { FinishReason } from '../types/language-model';

const name = 'AI_ToolCallNotExecutedError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

export class ToolCallNotExecutedError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  readonly toolName: string;
  readonly toolCallId: string;
  readonly finishReason: FinishReason;

  constructor({
    toolName,
    toolCallId,
    finishReason,
  }: {
    toolName: string;
    toolCallId: string;
    finishReason: FinishReason;
  }) {
    super({
      name,
      message: `Tool "${toolName}" was not executed because the model call finished with reason "${finishReason}".`,
    });

    this.toolName = toolName;
    this.toolCallId = toolCallId;
    this.finishReason = finishReason;
  }

  static isInstance(error: unknown): error is ToolCallNotExecutedError {
    return AISDKError.hasMarker(error, marker);
  }
}
