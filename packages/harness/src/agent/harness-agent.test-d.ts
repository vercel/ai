import { describe, expectTypeOf, test } from 'vitest';
import type { HarnessAgentSession } from './harness-agent-session';
import type { HarnessAgent } from './harness-agent';

describe('HarnessAgent steering types', () => {
  test('exposes the experimental agent and session methods', () => {
    expectTypeOf<HarnessAgent['experimental_steer']>().toEqualTypeOf<
      (options: { session: HarnessAgentSession; text: string }) => Promise<void>
    >();
    expectTypeOf<HarnessAgentSession['experimental_steerTurn']>().toEqualTypeOf<
      (text: string) => Promise<void>
    >();
  });
});
