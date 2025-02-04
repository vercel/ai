import { AISDKError } from '@ai-sdk/provider';
import { InternalUIMessage } from './ui-message';

const name = 'AI_MessageConversionError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

export class MessageConversionError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  readonly originalMessage: InternalUIMessage;

  constructor({
    originalMessage,
    message,
  }: {
    originalMessage: InternalUIMessage;
    message: string;
  }) {
    super({ name, message });

    this.originalMessage = originalMessage;
  }

  static isInstance(error: unknown): error is MessageConversionError {
    return AISDKError.hasMarker(error, marker);
  }
}
