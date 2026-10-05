import { AISDKError } from '@ai-sdk/provider';

const name = 'AI_SteeringSignalAlreadyBoundError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

export class SteeringSignalAlreadyBoundError extends AISDKError {
  private readonly [symbol] = true;

  constructor({
    message = 'Cannot bind steering signal: this signal is already bound to another execution.',
  }: {
    message?: string;
  } = {}) {
    super({ name, message });
  }

  static isInstance(error: unknown): error is SteeringSignalAlreadyBoundError {
    return AISDKError.hasMarker(error, marker);
  }
}
