import { expectTypeOf } from 'vitest';
import type { HarnessV1SandboxSessionResumeOptions } from './harness-v1-sandbox-session-resume-options';

type Options = HarnessV1SandboxSessionResumeOptions<{
  readonly token?: string;
}>;

expectTypeOf<{ sandboxId: string }>().toExtend<Options>();
expectTypeOf<{
  sandboxId: string;
  abortSignal: AbortSignal;
  token: string;
}>().toExtend<Options>();
expectTypeOf<{ token: string }>().not.toExtend<Options>();
