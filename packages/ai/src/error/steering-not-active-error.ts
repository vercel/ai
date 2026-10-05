import { AISDKError } from '@ai-sdk/provider';

const name = 'AI_SteeringNotActiveError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

export class SteeringNotActiveError extends AISDKError {
  private readonly [symbol] = true;

  constructor({
    message = 'Cannot steer: the steering signal is not bound to an active execution. Mid-turn steering requires an active turn.',
  }: {
    message?: string;
  } = {}) {
    super({ name, message });
  }

  static isInstance(error: unknown): error is SteeringNotActiveError {
    return AISDKError.hasMarker(error, marker);
  }
}
