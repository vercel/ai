import { AISDKError } from '@ai-sdk/provider';
import { HarnessError } from '../../../errors/harness-error';

const storageEncryptionName = 'AI_HarnessStorageEncryptionError';
const storageEncryptionMarker = `vercel.ai.error.${storageEncryptionName}`;
const storageEncryptionSymbol = Symbol.for(storageEncryptionMarker);

/**
 * Marks storage crypto failures so a drive cannot turn them into an ordinary
 * persisted turn failure or retry them as transport failures.
 */
export class HarnessStorageEncryptionError extends HarnessError {
  private readonly [storageEncryptionSymbol] = true;
  readonly operation: 'resolve-key' | 'encrypt' | 'decrypt';

  /**
   * Retains the original failure without including payloads or key material
   * in the error's message.
   */
  constructor(options: {
    operation: 'resolve-key' | 'encrypt' | 'decrypt';
    cause: unknown;
  }) {
    super({
      message: `HarnessAgent: storage encryption failed (${options.operation}).`,
      cause: options.cause,
    });
    this.operation = options.operation;
    Object.defineProperty(this, 'name', { value: storageEncryptionName });
  }

  /**
   * Recognizes failures across separately bundled copies of the engine.
   */
  static isInstance(error: unknown): error is HarnessStorageEncryptionError {
    return AISDKError.hasMarker(error, storageEncryptionMarker);
  }
}

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
