import { expectTypeOf, test } from 'vitest';
import type { HarnessV1SandboxHandle } from './harness-v1-sandbox-handle';
import type { HarnessV1SandboxProvider } from './harness-v1-sandbox-provider';

test('HarnessV1SandboxProvider has create returning a handle', () => {
  type CreateReturn = ReturnType<HarnessV1SandboxProvider['create']>;
  expectTypeOf<Awaited<CreateReturn>>().toEqualTypeOf<HarnessV1SandboxHandle>();
});
