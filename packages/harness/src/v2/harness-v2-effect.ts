import type { HarnessV2SerializableValue } from './harness-v2-serializable-value';

export type HarnessV2EffectOutput<
  T extends HarnessV2SerializableValue = HarnessV2SerializableValue,
> =
  | {
      readonly type: 'result';
      readonly value: T;
    }
  | { readonly type: 'error'; readonly error: string }
  | {
      readonly type: 'interrupted';
      readonly retryable: boolean;
      readonly partial?: T;
    };

export type HarnessV2Effect = {
  readonly key: string;
  readonly attempt: number;
  readonly name: string;
  readonly replay: 'safe' | 'never';
  readonly input: HarnessV2SerializableValue;
  readonly deliveredSubmissionIds: readonly string[];
  readonly output?: HarnessV2EffectOutput;
};

export interface HarnessV2EffectContext {
  abortSignal: AbortSignal;
  startId: string;
}
