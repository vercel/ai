import type { HarnessV2Effect } from './harness-v2-effect';
import type { SerializableValue } from '@ai-sdk/provider';
import type { HarnessV2Submission } from './harness-v2-submission';

/**
 * Event variants stored in a harness log and exposed to the adapter.
 */
export type HarnessV2LogEvent =
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
      readonly id?: string;
    };

/**
 * Append-only log interface available to a HarnessV2 adapter.
 */
export type HarnessV2Log = {
  /**
   * Reads events after a numeric position, optionally filtering by event type.
   */
  read(options?: {
    after?: number;
    types?: HarnessV2LogEvent['type'][];
  }): Promise<{ events: HarnessV2LogEvent[]; position: number }>;

  /**
   * Appends an adapter-namespaced event; host-owned event types are not writable.
   * Resolves once the matching event is confirmed committed. Returns false if
   * an identical event with the supplied ID is found before writing. Returns
   * true when a matching event is confirmed after attempting a write, including
   * when a concurrent append committed it. Conflicting content under the same
   * ID is rejected.
   */
  append(
    event: Extract<HarnessV2LogEvent, { type: `harness:${string}` }>,
  ): Promise<boolean>;

  /**
   * Registers a listener called when an event is appended and returns its
   * unsubscribe function.
   */
  onAppend(listener: () => void): () => void;
};
