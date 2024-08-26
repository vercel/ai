import { AISDKError } from '@ai-sdk/provider';

const name = 'AI_MessageConversionError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

export class MessageConversionError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  readonly role: string;

  constructor({ role, message }: { role: string; message: string }) {
    super({ name, message });

    this.role = role;
  }

  static isInstance(error: unknown): error is MessageConversionError {
    return AISDKError.hasMarker(error, marker);
  }
}
