import { AISDKError } from '@ai-sdk/provider';

const name = 'AI_SteeringClosedError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

export class SteeringClosedError extends AISDKError {
  private readonly [symbol] = true;

  constructor({
    message = 'Cannot steer: the execution turn has already finalized or completed.',
  }: {
    message?: string;
  } = {}) {
    super({ name, message });
  }

  static isInstance(error: unknown): error is SteeringClosedError {
    return AISDKError.hasMarker(error, marker);
  }
}
