import { AISDKError } from '@ai-sdk/provider';
import { HarnessError } from './harness-error';

const name = 'AI_HarnessAdapterContractError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

/**
 * Thrown when a harness adapter violates the `HarnessV2` drive contract, e.g.
 * by finishing a step out of order, finishing a turn that has not started, or
 * delivering more than one prompt to start a single turn.
 *
 * Unlike `HarnessInvalidDriveStateError`, which signals stale drive state that
 * a fresh drive can recover from, this error indicates a permanent bug in the
 * adapter implementation.
 */
export class HarnessAdapterContractError extends HarnessError {
  private readonly [symbol] = true;

  /**
   * Creates an adapter contract error with the given message and optional
   * cause.
   */
  constructor({ message, cause }: { message: string; cause?: unknown }) {
    super({ message, cause });
    Object.defineProperty(this, 'name', { value: name });
  }

  /**
   * Returns whether `error` is a `HarnessAdapterContractError`.
   */
  static isInstance(error: unknown): error is HarnessAdapterContractError {
    return AISDKError.hasMarker(error, marker);
  }
}
