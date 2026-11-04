import { AISDKError } from '@ai-sdk/provider';
import { HarnessError } from './harness-error';

const name = 'AI_HarnessInvalidDriveStateError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

/**
 * Signals that a harness drive must be rebuilt from a fresh read of its log.
 */
export class HarnessInvalidDriveStateError extends HarnessError {
  private readonly [symbol] = true;

  constructor({ message, cause }: { message: string; cause?: unknown }) {
    super({ message, cause });
    Object.defineProperty(this, 'name', { value: name });
  }

  static isInstance(error: unknown): error is HarnessInvalidDriveStateError {
    return AISDKError.hasMarker(error, marker);
  }
}
