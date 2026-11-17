import { expectTypeOf, test } from 'vitest';
import type { SerializableValue } from '@ai-sdk/provider';
import type {
  HarnessV2Log,
  HarnessV2LogEffectAttempt,
  HarnessV2LogEvent,
  HarnessV2LogTurn,
} from '../../../v2/harness-v2-log';
import type {
  HarnessV2FinishReason,
  HarnessV2Metadata,
  HarnessV2Usage,
} from '../../../v2/harness-v2-stream-part';
import type {
  HarnessAgentLog,
  HarnessAgentLogEffectAttempt,
  HarnessAgentLogEvent,
  HarnessAgentLogTurn,
} from './create-log';

test('delivers internal events while accepting zero-argument listeners', () => {
  /**
   * Internal callback contract for committed event delivery.
   */
  type Listener = Parameters<HarnessAgentLog['onAppend']>[0]['listener'];
  expectTypeOf<Parameters<Listener>>().toEqualTypeOf<[HarnessAgentLogEvent]>();
  expectTypeOf<() => void>().toMatchTypeOf<Listener>();
  expectTypeOf<Parameters<HarnessV2Log['onAppend']>[0]>().toEqualTypeOf<
    () => void
  >();
});

test('requires an ID for every internal log event', () => {
  expectTypeOf<HarnessAgentLogEvent>().toMatchTypeOf<{ id: string }>();
});

test('allows adapters to append events without an ID', () => {
  expectTypeOf<{
    type: 'harness:journal';
    data: null;
  }>().toMatchTypeOf<Parameters<HarnessV2Log['append']>[0]>();
});

test('keeps engine-only events internal to the agent', () => {
  expectTypeOf<
    Extract<
      HarnessV2LogEvent,
      {
        type:
          | 'turn-start'
          | 'finish-step'
          | 'drive-start'
          | 'crash-request'
          | 'drive-crash'
          | 'tool-execution-start';
      }
    >
  >().toBeNever();
});

test('exposes turn finish events to the adapter', () => {
  expectTypeOf<
    Extract<HarnessV2LogEvent, { type: 'finish-turn' }>
  >().toEqualTypeOf<{
    readonly type: 'finish-turn';
    readonly data: {
      readonly turnId: string;
      readonly finishReason: HarnessV2FinishReason;
      readonly totalUsage: HarnessV2Usage;
      readonly harnessMetadata?: HarnessV2Metadata;
    };
    readonly id: string;
  }>();
});

test('extends the adapter-facing lookup shapes for the agent engine', () => {
  expectTypeOf<HarnessAgentLogTurn>().toMatchTypeOf<HarnessV2LogTurn>();
  expectTypeOf<HarnessAgentLogEffectAttempt>().toMatchTypeOf<HarnessV2LogEffectAttempt>();
});

test('offers lookups instead of reading events', () => {
  expectTypeOf<HarnessAgentLog>().not.toHaveProperty('read');
  expectTypeOf<HarnessV2Log>().not.toHaveProperty('read');
  expectTypeOf<HarnessV2Log>().not.toHaveProperty('refresh');
  expectTypeOf<HarnessV2Log>().not.toHaveProperty('hasToolExecutionStart');
  expectTypeOf<HarnessAgentLog['refresh']>().toEqualTypeOf<
    () => Promise<void>
  >();
});

test('keeps progress events internal to the agent', () => {
  expectTypeOf<
    Extract<HarnessV2LogEvent, { type: 'effect-progress' }>
  >().toBeNever();
  expectTypeOf<
    Extract<HarnessAgentLogEvent, { type: 'effect-progress' }>
  >().toEqualTypeOf<{
    readonly type: 'effect-progress';
    readonly data: {
      readonly startId: string;
      readonly partial: SerializableValue;
    };
    readonly id: string;
  }>();
});
