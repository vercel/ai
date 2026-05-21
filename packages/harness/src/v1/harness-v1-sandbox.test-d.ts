import type { Experimental_Sandbox } from '@ai-sdk/provider-utils';
import { expectTypeOf, test } from 'vitest';
import type { HarnessV1Sandbox } from './harness-v1-sandbox';

test('HarnessV1Sandbox extends Experimental_Sandbox', () => {
  expectTypeOf<HarnessV1Sandbox>().toMatchTypeOf<Experimental_Sandbox>();
});

test('HarnessV1Sandbox adds only optional extras', () => {
  // Both extras must be optional so any plain Experimental_Sandbox satisfies
  // HarnessV1Sandbox.
  expectTypeOf<HarnessV1Sandbox['getPortUrl']>().toEqualTypeOf<
    HarnessV1Sandbox['getPortUrl']
  >();
  const _sandbox: Experimental_Sandbox = {} as never;
  // Type-level: a plain sandbox satisfies the harness sandbox surface.
  const _harnessSandbox: HarnessV1Sandbox = _sandbox;
  void _harnessSandbox;
});
