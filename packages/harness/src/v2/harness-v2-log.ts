import type { HarnessV2Effect } from './harness-v2-effect';
import type { HarnessV2SerializableValue } from './harness-v2-serializable-value';
import type { HarnessV2Submission } from './harness-v2-submission';

export type HarnessV2LogEvent =
  | {
      readonly type: 'submission';
      readonly data: HarnessV2Submission;
      readonly id: string;
    }
  | {
      readonly type: 'effect-start';
      readonly data: Omit<HarnessV2Effect, 'output'>;
      readonly id: string;
    }
  | {
      readonly type: 'effect-end';
      readonly data: {
        readonly startId: string;
        readonly output: NonNullable<HarnessV2Effect['output']>;
      };
      readonly id: string;
    }
  | {
      readonly type: `harness:${string}`;
      readonly data: HarnessV2SerializableValue;
      readonly id?: string;
    };

export type HarnessV2Log = {
  read(opts?: {
    after?: number;
    types?: HarnessV2LogEvent['type'][];
  }): Promise<{ events: HarnessV2LogEvent[]; position: number }>;
  append(
    event: Extract<HarnessV2LogEvent, { type: `harness:${string}` }>,
  ): Promise<boolean>;
  onAppend(listener: () => void): () => void;
};
