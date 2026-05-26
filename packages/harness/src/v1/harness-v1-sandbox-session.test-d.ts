import type { Experimental_Sandbox } from '@ai-sdk/provider-utils';
import { expectTypeOf, test } from 'vitest';
import type { HarnessV1SandboxSession } from './harness-v1-sandbox-session';

test('HarnessV1SandboxSession is an alias for Experimental_Sandbox', () => {
  expectTypeOf<HarnessV1SandboxSession>().toEqualTypeOf<Experimental_Sandbox>();
});
