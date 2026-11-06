import { expectTypeOf, test } from 'vitest';
import type { SerializableValue } from '@ai-sdk/provider-utils';
import type { HarnessV2EffectFunction } from '../../../index';
import type { HarnessV2DriveContext } from '../../../v2/harness-v2-drive-context';
import type {
  HarnessV2Log,
  HarnessV2LogEvent,
} from '../../../v2/harness-v2-log';
import type {
  HarnessAgentEffectFunction,
  HarnessAgentLog,
  HarnessAgentLogEvent,
} from './types';

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

test('redeclares the adapter effect signature without changing it', () => {
  expectTypeOf<HarnessAgentEffectFunction>().toEqualTypeOf<
    HarnessV2DriveContext['effect']
  >();
  expectTypeOf<HarnessAgentEffectFunction>().toEqualTypeOf<HarnessV2EffectFunction>();
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
