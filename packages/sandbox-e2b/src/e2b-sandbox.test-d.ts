import type {
  HarnessV1NetworkSandboxSession,
  HarnessV1SandboxTemplate,
} from '@ai-sdk/harness';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import type { Sandbox } from 'e2b';
import { expectTypeOf } from 'vitest';
import type {
  E2BNativeSandboxSession,
  E2BNetworkSandboxSessionCreateOptions,
  E2BNetworkSandboxSessionResumeOptions,
  createE2BNetworkSandboxSession,
  createE2BNetworkSandboxSessionFromNativeSandbox,
  createE2BSandboxSessionFromNativeSandbox,
  resumeE2BNetworkSandboxSession,
} from './e2b-sandbox';

type Options = E2BNetworkSandboxSessionCreateOptions;

expectTypeOf<{}>().toExtend<Options>();
expectTypeOf<{
  baseTemplate: string;
  ports: number[];
  template: HarnessV1SandboxTemplate;
  abortSignal: AbortSignal;
}>().toExtend<Options>();
expectTypeOf<{
  apiKey: string;
  timeoutMs: number;
  envs: Record<string, string>;
  metadata: Record<string, string>;
  network: { allowPublicTraffic: false; allowOut: string[] };
  lifecycle: { onTimeout: 'pause' };
  signal: AbortSignal;
}>().toExtend<Options>();
expectTypeOf<{ ports: readonly [4000] }>().toExtend<Options>();
// `template` is the harness sandbox template; the E2B template is `baseTemplate`.
expectTypeOf<{ template: string }>().not.toExtend<Options>();
// E2B assigns sandbox IDs.
expectTypeOf<{ sandboxId: string }>().not.toExtend<Options>();
expectTypeOf<{ sandbox: E2BNativeSandboxSession }>().not.toExtend<Options>();

type ResumeOptions = E2BNetworkSandboxSessionResumeOptions;

expectTypeOf<{
  sandboxId: string;
  apiKey: string;
  domain: string;
  timeoutMs: number;
  onResume: 'reboot';
  signal: AbortSignal;
  abortSignal: AbortSignal;
}>().toExtend<ResumeOptions>();
expectTypeOf<{}>().not.toExtend<ResumeOptions>();
expectTypeOf<ResumeOptions>().not.toHaveProperty('baseTemplate');
expectTypeOf<ResumeOptions>().not.toHaveProperty('template');
expectTypeOf<ResumeOptions>().not.toHaveProperty('ports');

expectTypeOf<{
  sandbox: Sandbox;
  defaultWorkingDirectory: string;
}>().toExtend<E2BNativeSandboxSession>();
expectTypeOf<{
  sandbox: Sandbox;
  defaultWorkingDirectory: string;
  ports: number[];
}>().toExtend<E2BNativeSandboxSession>();
// E2B reports the working directory only asynchronously, so it is required.
expectTypeOf<{ sandbox: Sandbox }>().not.toExtend<E2BNativeSandboxSession>();
expectTypeOf<Sandbox>().not.toExtend<E2BNativeSandboxSession>();

expectTypeOf<
  typeof createE2BNetworkSandboxSession
>().returns.resolves.toEqualTypeOf<HarnessV1NetworkSandboxSession>();
expectTypeOf<
  typeof resumeE2BNetworkSandboxSession
>().returns.resolves.toEqualTypeOf<HarnessV1NetworkSandboxSession>();
expectTypeOf<
  typeof createE2BSandboxSessionFromNativeSandbox
>().parameters.toEqualTypeOf<[nativeSandbox: E2BNativeSandboxSession]>();
expectTypeOf<
  typeof createE2BSandboxSessionFromNativeSandbox
>().returns.toEqualTypeOf<SandboxSession>();
expectTypeOf<
  typeof createE2BNetworkSandboxSessionFromNativeSandbox
>().parameters.toEqualTypeOf<[nativeSandbox: E2BNativeSandboxSession]>();
expectTypeOf<
  typeof createE2BNetworkSandboxSessionFromNativeSandbox
>().returns.toEqualTypeOf<HarnessV1NetworkSandboxSession>();
