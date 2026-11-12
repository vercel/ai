import { AISDKError } from '@ai-sdk/provider';
import { HarnessError } from '../../../errors/harness-error';

const beforeStartName = 'AI_HarnessBeforeStartError';
const beforeStartMarker = `vercel.ai.error.${beforeStartName}`;
const beforeStartSymbol = Symbol.for(beforeStartMarker);

/**
 * Wraps what the harness or the engine threw when a drive failed before the
 * session's current turn started, so there is no turn to report the error in.
 * The original error is the `cause`.
 */
export class HarnessBeforeStartError extends HarnessError {
  private readonly [beforeStartSymbol] = true;

  /**
   * Wraps the error the failed drive threw.
   */
  constructor({ cause }: { cause: unknown }) {
    super({
      message: 'HarnessAgent: the drive failed before the turn started.',
      cause,
    });
    Object.defineProperty(this, 'name', { value: beforeStartName });
  }

  /**
   * Returns whether `error` is a `HarnessBeforeStartError`.
   */
  static isInstance(error: unknown): error is HarnessBeforeStartError {
    return AISDKError.hasMarker(error, beforeStartMarker);
  }
}

const afterFinishName = 'AI_HarnessAfterFinishError';
const afterFinishMarker = `vercel.ai.error.${afterFinishName}`;
const afterFinishSymbol = Symbol.for(afterFinishMarker);

/**
 * Wraps what the harness or the engine threw when a drive failed after the
 * session's latest turn finished, so there is no turn to report the error in.
 * The original error is the `cause`.
 */
export class HarnessAfterFinishError extends HarnessError {
  private readonly [afterFinishSymbol] = true;

  /**
   * Wraps the error the failed drive threw.
   */
  constructor({ cause }: { cause: unknown }) {
    super({
      message: 'HarnessAgent: the drive failed after the turn finished.',
      cause,
    });
    Object.defineProperty(this, 'name', { value: afterFinishName });
  }

  /**
   * Returns whether `error` is a `HarnessAfterFinishError`.
   */
  static isInstance(error: unknown): error is HarnessAfterFinishError {
    return AISDKError.hasMarker(error, afterFinishMarker);
  }
}
