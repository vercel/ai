import { expectTypeOf, test } from 'vitest';
import type { HarnessV2Log } from '../../../v2/harness-v2-log';
import type { HarnessAgentLogEvent } from './types';

test('requires an ID for every internal log event', () => {
  expectTypeOf<HarnessAgentLogEvent>().toMatchTypeOf<{ id: string }>();
});

test('allows adapters to append events without an ID', () => {
  expectTypeOf<{
    type: 'harness:journal';
    data: null;
  }>().toMatchTypeOf<Parameters<HarnessV2Log['append']>[0]>();
});
