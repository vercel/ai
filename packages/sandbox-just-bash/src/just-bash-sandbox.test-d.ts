import { expectTypeOf } from 'vitest';
import type { HarnessV1SandboxTemplate } from '@ai-sdk/harness';
import type {
  JustBashNativeSandboxSession,
  JustBashNetworkSandboxSessionCreateOptions,
  JustBashNetworkSandboxSessionResumeOptions,
} from './just-bash-sandbox';

type Options = JustBashNetworkSandboxSessionCreateOptions;

expectTypeOf<{
  cwd: string;
  template: HarnessV1SandboxTemplate;
  abortSignal: AbortSignal;
  sandboxId: string;
}>().toExtend<Options>();
expectTypeOf<{
  sandbox: JustBashNativeSandboxSession;
}>().not.toExtend<Options>();

expectTypeOf<{
  sandboxId: string;
  abortSignal: AbortSignal;
}>().toExtend<JustBashNetworkSandboxSessionResumeOptions>();
expectTypeOf<{}>().not.toExtend<JustBashNetworkSandboxSessionResumeOptions>();
