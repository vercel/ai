import type { SerializableValue } from '@ai-sdk/provider-utils';

export type HarnessV2EffectOutput<
  T extends SerializableValue = SerializableValue,
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
  readonly input: SerializableValue;
  readonly deliveredSubmissionIds: readonly string[];
  readonly output?: HarnessV2EffectOutput;
};

export interface HarnessV2EffectContext {
  abortSignal: AbortSignal;
  startId: string;
}
