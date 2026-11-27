import type { HarnessV2Effect } from './harness-v2-effect';
import type { SerializableValue } from '@ai-sdk/provider';
import type {
  HarnessV2FinishReason,
  HarnessV2Metadata,
  HarnessV2Usage,
} from './harness-v2-stream-part';
import type { HarnessV2Submission } from './harness-v2-submission';

/**
 * Records a user prompt, steering message or cancel submitted to the session.
 */
export type HarnessV2LogSubmissionEvent = {
  /**
   * A user prompt, steering message or cancel submitted to the session.
   */
  readonly type: 'submission';

  /**
   * Submission payload, including its turn settings when applicable.
   */
  readonly data: HarnessV2Submission;

  /**
   * Stable event identity within the session, used for deduplication.
   * Independent of the event's committed log position.
   */
  readonly id: string;
};

/**
 * Records the start of an effect attempt.
 */
export type HarnessV2LogEffectStartEvent = {
  /**
   * Marks the start of a host-managed effect attempt.
   */
  readonly type: 'effect-start';

  /**
   * Effect definition before an output has been recorded.
   */
  readonly data: Omit<HarnessV2Effect, 'output'>;

  /**
   * Stable event identity within the session, used for deduplication.
   * Independent of the event's committed log position.
   */
  readonly id: string;
};

/**
 * Records the completion or interruption of an effect attempt.
 */
export type HarnessV2LogEffectEndEvent = {
  /**
   * Marks completion or interruption of an effect attempt.
   */
  readonly type: 'effect-end';

  /**
   * Start event ID and output recorded for the effect.
   */
  readonly data: {
    /**
     * ID of the corresponding `effect-start` event.
     */
    readonly startId: string;

    /**
     * Final or interrupted outcome for the effect attempt.
     */
    readonly output: NonNullable<HarnessV2Effect['output']>;
  };

  /**
   * Stable event identity within the session, used for deduplication.
   * Independent of the event's committed log position.
   */
  readonly id: string;
};

/**
 * Records a finished turn.
 */
export type HarnessV2LogFinishTurnEvent = {
  /**
   * Marks a finished turn. Written by the agent, either when the adapter
   * calls `finishTurn()` or when the agent ends the turn itself, e.g.
   * after a failed drive. A finished turn must not be resumed by a later
   * drive.
   */
  readonly type: 'finish-turn';

  /**
   * Turn identity and the options the turn was finished with.
   */
  readonly data: {
    /**
     * ID of the turn.
     */
    readonly turnId: string;

    /**
     * Reason reported for the turn's completion.
     */
    readonly finishReason: HarnessV2FinishReason;

    /**
     * Aggregate usage across all steps in the turn.
     */
    readonly totalUsage: HarnessV2Usage;

    /**
     * Provider metadata associated with the turn, if any.
     */
    readonly harnessMetadata?: HarnessV2Metadata;
  };

  /**
   * Stable event identity within the session, used for deduplication.
   * Independent of the event's committed log position.
   */
  readonly id: string;
};

/**
 * Records an adapter-defined event, the only kind an adapter can append.
 */
export type HarnessV2LogAdapterEvent = {
  /**
   * Adapter-defined event namespace accepted by the public append method.
   */
  readonly type: `harness:${string}`;

  /**
   * Serializable adapter-specific event payload.
   */
  readonly data: SerializableValue;

  /**
   * Stable event identity within the session, used for deduplication.
   * Independent of the event's committed log position.
   */
  readonly id?: string;
};

/**
 * Event variants stored in a harness log and exposed to the adapter.
 */
export type HarnessV2LogEvent =
  | HarnessV2LogSubmissionEvent
  | HarnessV2LogEffectStartEvent
  | HarnessV2LogEffectEndEvent
  | HarnessV2LogFinishTurnEvent
  | HarnessV2LogAdapterEvent;

/**
 * An accepted effect attempt: its `effect-start` event and its first
 * `effect-end` event.
 *
 * An `effect-start` is accepted only if it is the next attempt of its effect
 * and the previous attempt, if any, ended with a retryable interruption.
 * Starts that were not accepted, and every end after the first, have no
 * effect.
 */
export type HarnessV2LogEffectAttempt = {
  /**
   * Start of the attempt.
   */
  readonly start: HarnessV2LogEffectStartEvent;

  /**
   * First committed end of the attempt, if it ended.
   */
  readonly end?: HarnessV2LogEffectEndEvent;
};

/**
 * A turn: the prompt submissions whose delivery started it, and its finish.
 */
export type HarnessV2LogTurn = {
  /**
   * Prompt submissions whose delivery started the turn, in log order. When
   * several prompts are waiting before a turn starts, adapters merge them into
   * a single prompt and deliver all of them together; the latest prompt's
   * `settings` apply.
   */
  readonly submissions: readonly HarnessV2LogSubmissionEvent[];

  /**
   * Finish of the turn, if it finished. A finished turn must not be resumed
   * by a later drive.
   */
  readonly finish?: HarnessV2LogFinishTurnEvent;
};

/**
 * Append-only log interface available to a HarnessV2 adapter.
 *
 * The log is the source of truth of the session. Its lookups answer from the
 * events the agent has read or written so far, which the agent keeps current
 * while the drive runs. Lookups are synchronous and return copies, so they can
 * be called whenever the adapter needs to know what the log recorded.
 *
 * ```ts
 * const prompt = context.log
 *   .getUndeliveredSubmissions()
 *   .find(submission => submission.data.type === 'prompt');
 * const turn = context.log.getCurrentTurn();
 * const resume = turn != null && turn.finish == null;
 * const recorded = context.log.getEffect({ key: 'model:3' })?.end?.data.output;
 * ```
 */
export type HarnessV2Log = {
  /**
   * Appends an adapter-namespaced event; host-owned event types are not writable.
   * Resolves once the matching event is confirmed committed. Returns false if
   * an identical event with the supplied ID is found before writing. Returns
   * true when a matching event is confirmed after attempting a write, including
   * when a concurrent append committed it. Conflicting content under the same
   * ID is rejected.
   */
  append(event: HarnessV2LogAdapterEvent): Promise<boolean>;

  /**
   * Registers a listener called when the agent recorded a new event that the
   * adapter did not append itself, once all lookups include it. Returns the
   * unsubscribe function.
   */
  onAppend(listener: () => void): () => void;

  /**
   * Returns the submissions, in log order.
   */
  getSubmissions(): readonly HarnessV2LogSubmissionEvent[];

  /**
   * Returns the submissions waiting for delivery, in log order:
   *
   * - a prompt until an accepted `effect-start` delivers it;
   * - a steer until an accepted `effect-start` delivers it, as long as the
   *   turn that was running when it was recorded has not finished;
   * - a cancel as long as the turn that was running when it was recorded has
   *   not finished. It counts as delivered once that turn finishes with
   *   finish reason `cancelled`, so any cancel returned here is for the
   *   running turn.
   *
   * A steer or cancel recorded while no turn was running, or whose turn
   * finished otherwise, is withdrawn and never returned.
   */
  getUndeliveredSubmissions(): readonly HarnessV2LogSubmissionEvent[];

  /**
   * Returns the latest accepted attempt of an effect key.
   */
  getEffect(options: {
    /**
     * Key of the effect.
     */
    key: string;
  }): HarnessV2LogEffectAttempt | undefined;

  /**
   * Returns the latest accepted attempt of each effect key, ordered by the
   * log position of those attempts' starts.
   */
  getEffects(options?: {
    /**
     * Only effect keys starting with this prefix.
     */
    keyPrefix?: string;
  }): readonly HarnessV2LogEffectAttempt[];

  /**
   * Returns the latest turn, finished or not.
   */
  getCurrentTurn(): HarnessV2LogTurn | undefined;

  /**
   * Returns all turns, in start order.
   */
  getTurns(): readonly HarnessV2LogTurn[];

  /**
   * Returns the adapter's own events, in log order.
   */
  getAdapterEvents(options?: {
    /**
     * Only events of this type.
     */
    type?: `harness:${string}`;
  }): readonly HarnessV2LogAdapterEvent[];
};
