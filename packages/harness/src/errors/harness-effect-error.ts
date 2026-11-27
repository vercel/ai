import { AISDKError } from '@ai-sdk/provider';
import { HarnessError } from './harness-error';

const name = 'AI_HarnessEffectError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

/**
 * Throwable counterpart of `HarnessV2EffectError`, for failed effects surfaced
 * in memory. The serializable error data is what the log and stream carry; a
 * `HarnessV2EffectError` can be passed directly as constructor input, e.g.
 * `new HarnessEffectError(output.error)`.
 */
export class HarnessEffectError extends HarnessError {
  private readonly [symbol] = true;

  constructor({ message, cause }: { message: string; cause?: unknown }) {
    super({ message, cause });
    Object.defineProperty(this, 'name', { value: name });
  }

  static isInstance(error: unknown): error is HarnessEffectError {
    return AISDKError.hasMarker(error, marker);
  }
}
