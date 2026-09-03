import { AISDKError } from '@ai-sdk/provider';
import { HarnessError } from './harness-error';

const name = 'AI_HarnessHistoryUnavailableError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

/**
 * Thrown by `readHistory` when the adapter supports history reads but cannot
 * reach the runtime's store from the current environment — for example the
 * store lives inside a remote sandbox, or the transcript directory is
 * missing or unreadable.
 *
 * Distinct from `HarnessCapabilityUnsupportedError` (the adapter does not
 * implement history reads at all) so hosts can retry or degrade differently.
 * A conversation with no recorded messages yet is not an error; it resolves
 * to an empty result instead.
 */
export class HarnessHistoryUnavailableError extends HarnessError {
  private readonly [symbol] = true;

  readonly harnessId?: string;

  constructor({
    message,
    harnessId,
    cause,
  }: {
    message: string;
    harnessId?: string;
    cause?: unknown;
  }) {
    super({ message, cause });
    Object.defineProperty(this, 'name', { value: name });
    this.harnessId = harnessId;
  }

  static isInstance(error: unknown): error is HarnessHistoryUnavailableError {
    return AISDKError.hasMarker(error, marker);
  }
}
