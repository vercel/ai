import { expectTypeOf } from 'vitest';
import type { HarnessV1SandboxSessionCreateOptions } from './harness-v1-sandbox-session-create-options';

type Options = HarnessV1SandboxSessionCreateOptions<{
  readonly image?: string;
}>;

expectTypeOf<{}>().toExtend<Options>();
expectTypeOf<{
  sandboxId: string;
  image: string;
  abortSignal: AbortSignal;
}>().toExtend<Options>();
