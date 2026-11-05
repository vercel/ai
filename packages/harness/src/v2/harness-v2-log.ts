import type { HarnessV2Effect } from './harness-v2-effect';
import type { SerializableValue } from '@ai-sdk/provider-utils';
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
       * Stable event ID used for ordering and cursor positions.
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
       * ID referenced by the matching effect-end event.
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
       * Event ID assigned to this effect-end record.
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
       * Optional caller-supplied ID for correlating the event.
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
  read(opts?: {
    after?: number;
    types?: HarnessV2LogEvent['type'][];
  }): Promise<{ events: HarnessV2LogEvent[]; position: number }>;

  /**
   * Appends an adapter-namespaced event; host-owned event types are not writable.
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
