import { AISDKError } from '@ai-sdk/provider';

const name = 'AI_MissingToolResultError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

export class MissingToolResultError extends AISDKError {
  private readonly [symbol] = true;

  readonly toolCallId: string;

  constructor({ toolCallId }: { toolCallId: string }) {
    super({
      name,
      message: `Tool result is missing for tool call ${toolCallId}.`,
    });

    this.toolCallId = toolCallId;
  }

  static isInstance(error: unknown): error is MissingToolResultError {
    return AISDKError.hasMarker(error, marker);
  }
}
