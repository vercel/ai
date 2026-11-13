import type { SerializableValue } from '@ai-sdk/provider';
import type { HarnessV2StreamPart } from './harness-v2-stream-part';

/**
 * Serializable error data recorded in the log or emitted to the stream. Never
 * an `Error` instance, so it can cross process boundaries through a World;
 * `HarnessEffectError` is its throwable counterpart.
 */
export type HarnessV2EffectError = {
  /**
   * Human-readable error message.
   */
  readonly message: string;
};

/**
 * Outcome returned by one invocation of a replay-aware effect.
 */
export type HarnessV2EffectOutput<
  /*
   * Ideally `T extends SerializableValue`. The constraint is omitted because
   * TypeScript never infers an implicit index signature for an `interface`,
   * so values typed with interfaces (e.g. the `FileData` variants inside
   * `ToolResultOutput`) cannot satisfy `SerializableValue` even when they are
   * serializable at runtime. `HarnessV2EffectFunction` still requires
   * `T extends SerializableValue` wherever an effect output is recorded.
   */
  T = SerializableValue,
> =
  | {
      /**
       * The effect completed and produced a value.
       */
      readonly type: 'result';

      /**
       * Serializable value produced by the effect.
       */
      readonly value: T;
    }
  | {
      /**
       * The effect failed with a serialized error.
       */
      readonly type: 'error';

      /**
       * Serializable error recorded for this effect attempt.
       */
      readonly error: HarnessV2EffectError;
    }
  | {
      /**
       * The effect was interrupted before it produced a final result.
       */
      readonly type: 'interrupted';

      /**
       * Whether the host may safely retry this interrupted attempt.
       */
      readonly retryable: boolean;

      /**
       * Partial serializable output available at interruption time.
       */
      readonly partial?: T;
    };

/**
 * Persisted state and replay policy for one effect key.
 */
export type HarnessV2Effect = {
  /**
   * Unique identifier for this specific effect within a session, used to match
   * it across drive attempts.
   */
  readonly key: string;

  /**
   * One-based execution attempt for this effect.
   */
  readonly attempt: number;

  /**
   * Kind of work shared by effects of the same kind, such as `model` or
   * `tool.Bash`. It is shown as the step name in observability tooling and can
   * be used to find effects of that kind in the log; `key` identifies one
   * specific effect.
   */
  readonly name: string;

  /**
   * Whether replay may reuse the previous result or must rerun the effect.
   */
  readonly replay: 'safe' | 'never';

  /**
   * Serializable input supplied to the effect callback.
   */
  readonly input: SerializableValue;

  /**
   * Submission IDs whose delivery has already been recorded for this effect.
   *
   * Only one turn runs at a time, and each turn starts with one prompt: a
   * prompt submitted while a turn is running waits until that turn finished.
   * So an effect may deliver at most one prompt that has not started a turn
   * yet, and only once the previous turn finished. Otherwise `effect()`
   * rejects with `HarnessInvalidDriveStateError` without recording anything.
   */
  readonly deliveredSubmissionIds: readonly string[];

  /**
   * Final or interrupted output recorded for the current attempt.
   */
  readonly output?: HarnessV2EffectOutput;
};

/**
 * Context passed to an effect callback while a drive attempt is active.
 */
export interface HarnessV2EffectContext {
  /**
   * Aborts the callback when its current drive attempt is cancelled.
   */
  abortSignal: AbortSignal;

  /**
   * ID of the log entry that started this effect attempt.
   */
  startId: string;

  /**
   * Emits a stream part produced by this attempt, already normalized, to the
   * agent's output. This is the regular way for a harness to emit stream
   * parts.
   *
   * Replay-safe: a replayed effect does not run its callback, so nothing is
   * emitted again. After a crash, the agent retracts the output of
   * interrupted attempts. Parts emitted after the attempt's callback settled,
   * or after the drive aborted, are dropped. Throws synchronously if the part
   * is not serializable.
   */
  emit(part: HarnessV2StreamPart): void;
}
