import type {
  HarnessV2Effect,
  HarnessV2EffectContext,
  HarnessV2EffectOutput,
} from '../../../v2/harness-v2-effect';
import type { HarnessV2Submission } from '../../../v2/harness-v2-submission';
import type { SerializableValue } from '@ai-sdk/provider-utils';

/**
 * Runs a keyed effect and returns its committed output. Terminal outputs are
 * replayed; recorded retryable interruptions permit a new attempt. Callback
 * failures become error outputs, while persistence failures reject the call.
 */
export type HarnessAgentEffectFunction = <
  T extends SerializableValue = SerializableValue,
>(
  key: string,
  options: Pick<HarnessV2Effect, 'name' | 'replay' | 'input'> &
    Partial<Pick<HarnessV2Effect, 'deliveredSubmissionIds'>>,
  fn: (context: HarnessV2EffectContext) => PromiseLike<T> | AsyncIterable<T>,
) => Promise<HarnessV2EffectOutput<T>>;

/**
 * Event variants stored in the agent log, including events that are private to
 * the HarnessAgent engine.
 *
 * Runtime checks for common fields and supported event types live in
 * is-valid-harness-agent-log-event.ts. Changes to these fields or event types
 * must also update that helper and its tests. Variant-specific data payloads
 * are not validated by the helper.
 */
export type HarnessAgentLogEvent =
  | {
      /**
       * A user prompt or steering message submitted to the session.
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
    }
  | {
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
    }
  | {
      /**
       * Records a complete yielded value, visible only to the agent engine.
       */
      readonly type: 'effect-progress';

      /**
       * Effect attempt and its latest yielded value.
       */
      readonly data: {
        /**
         * ID of the corresponding `effect-start` event.
         */
        readonly startId: string;

        /**
         * Complete yielded value used as partial output on interruption.
         */
        readonly partial: SerializableValue;
      };

      /**
       * Stable event identity within the session, used for deduplication.
       * Independent of the event's committed log position.
       */
      readonly id: string;
    }
  | {
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
    }
  | {
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
      readonly id: string;
    };

/**
 * Event type filters for an agent-log append listener.
 */
export type HarnessAgentLogListenerConfig = {
  /**
   * Event types the listener is allowed to receive.
   */
  types?: HarnessAgentLogEvent['type'][];

  /**
   * Event types the listener must not receive.
   */
  ignoreTypes?: HarnessAgentLogEvent['type'][];
};

/**
 * Append-only log used by the HarnessAgent engine. The harness adapter
 * receives a wrapped version of this (`HarnessV2Log`) with limited access.
 */
export type HarnessAgentLog = {
  /**
   * Refreshes the committed log and returns canonical events after a World
   * position, optionally filtered by type. Infrastructure and duplicate records
   * advance the position without appearing in the returned events.
   */
  read(opts?: {
    /**
     * Position after which to return events, independent of type filters.
     */
    after?: number;

    /**
     * Event types to include in the returned events.
     */
    types?: HarnessAgentLogEvent['type'][];
  }): Promise<{
    /**
     * Canonical events matching the requested position and event types.
     */
    events: HarnessAgentLogEvent[];
    /**
     * Last verified committed World slot, including non-harness records.
     */
    position: number;
  }>;

  /**
   * Appends an event and waits for its canonical durable outcome. Returns false
   * if an identical event is found before writing. Returns true when a matching
   * event is confirmed after attempting a write, including when a concurrent
   * append committed it. Conflicting content under the same ID is rejected.
   * Exhausted uncertain-outcome recovery refuses further appends on this
   * instance; reads and reconstruction through a new log remain available.
   */
  append(event: HarnessAgentLogEvent): Promise<boolean>;

  /**
   * Registers a callback for matching new events and returns an unsubscribe
   * function. Each matching canonical event first observed while registered is
   * delivered once, in committed order, with an independent payload snapshot.
   * Delivery is synchronous when a read or write folds the event, before that
   * operation resolves. Previously cached events are not replayed; events first
   * observed after registration may also appear in a subsequent read's history.
   * Callback failures are isolated from persistence and other listeners, and
   * asynchronous callback work is not awaited. External writes are discovered
   * through advisory hints, polling, reads, or append reconciliation.
   */
  onAppend(options: {
    /**
     * Callback invoked when an event matches the listener configuration.
     */
    listener: (event: HarnessAgentLogEvent) => void;

    /**
     * Optional allowlist and denylist for event types.
     */
    config?: HarnessAgentLogListenerConfig;
  }): () => void;
};
