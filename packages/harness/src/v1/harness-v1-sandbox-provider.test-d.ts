import { expectTypeOf, test } from 'vitest';
import type { HarnessV1NetworkSandboxSession } from './harness-v1-network-sandbox-session';
import type { HarnessV1SandboxProvider } from './harness-v1-sandbox-provider';

test('HarnessV1SandboxProvider has create returning a network sandbox session', () => {
  type CreateReturn = ReturnType<HarnessV1SandboxProvider['create']>;
  expectTypeOf<
    Awaited<CreateReturn>
  >().toEqualTypeOf<HarnessV1NetworkSandboxSession>();
});
