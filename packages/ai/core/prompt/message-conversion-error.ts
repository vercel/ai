import { AISDKError } from '@ai-sdk/provider';
import { ConvertibleMessage } from './convert-to-core-messages';

const name = 'AI_MessageConversionError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

export class MessageConversionError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  readonly originalMessage: ConvertibleMessage;

  constructor({
    originalMessage,
    message,
  }: {
    originalMessage: ConvertibleMessage;
    message: string;
  }) {
    super({ name, message });

    this.originalMessage = originalMessage;
  }

  static isInstance(error: unknown): error is MessageConversionError {
    return AISDKError.hasMarker(error, marker);
  }
}
