import type { SerializableValue } from '@ai-sdk/provider';

/**
 * Outcome returned by one invocation of a replay-aware effect.
 */
export type HarnessV2EffectOutput<
  T extends SerializableValue = SerializableValue,
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
       * Error message recorded for this effect attempt.
       */
      readonly error: string;
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
}
