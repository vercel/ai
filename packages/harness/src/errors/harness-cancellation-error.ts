import { AISDKError } from '@ai-sdk/provider';
import { HarnessError } from './harness-error';

const name = 'AI_HarnessCancellationError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

/**
 * Thrown by a harness adapter from an effect callback, or from a built-in
 * tool's `execute`, whose work it stopped because the user cancelled the
 * running turn. `effect()` records the attempt as `interrupted` (retryable
 * for `replay: 'safe'`, with its last partial output) instead of as an
 * `error`, and resolves with that output.
 */
export class HarnessCancellationError extends HarnessError {
  private readonly [symbol] = true;

  constructor({
    message = 'The turn was cancelled.',
    cause,
  }: { message?: string; cause?: unknown } = {}) {
    super({ message, cause });
    Object.defineProperty(this, 'name', { value: name });
  }

  static isInstance(error: unknown): error is HarnessCancellationError {
    return AISDKError.hasMarker(error, marker);
  }
}
