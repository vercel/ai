import { describe, expectTypeOf, test } from 'vitest';
import type { HarnessAgentSession } from './harness-agent-session';

describe('HarnessAgentSession', () => {
  test('exposes active-turn steering with text input', () => {
    expectTypeOf<HarnessAgentSession['steer']>().toEqualTypeOf<
      (text: string) => Promise<void>
    >();
  });
});
