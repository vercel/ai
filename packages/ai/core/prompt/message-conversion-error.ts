import { AISDKError } from '@ai-sdk/provider';
import { Message } from '../types';

const name = 'AI_MessageConversionError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

export class MessageConversionError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  readonly originalMessage: Omit<Message, 'id'>;

  constructor({
    originalMessage,
    message,
  }: {
    originalMessage: Omit<Message, 'id'>;
    message: string;
  }) {
    super({ name, message });

    this.originalMessage = originalMessage;
  }

  static isInstance(error: unknown): error is MessageConversionError {
    return AISDKError.hasMarker(error, marker);
  }
}
