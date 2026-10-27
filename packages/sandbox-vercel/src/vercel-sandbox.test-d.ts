import { expectTypeOf } from 'vitest';
import type { HarnessV1SandboxTemplate } from '@ai-sdk/harness';
import type {
  Experimental_SandboxProcess as SandboxProcess,
  Experimental_SandboxSession as SandboxSession,
  Experimental_WritableSandboxProcess as WritableSandboxProcess,
} from '@ai-sdk/provider-utils';
import type {
  createVercelNetworkSandboxSessionFromNativeSandbox,
  createVercelSandboxSessionFromNativeSandbox,
  VercelNativeSandboxSession,
  VercelNetworkSandboxSessionCreateOptions,
  VercelNetworkSandboxSessionResumeOptions,
} from './vercel-sandbox';
import type { VercelSandboxSession } from './vercel-sandbox-session';

declare const session: VercelSandboxSession;
declare const stdin: boolean;

const writable = session.spawn({ command: 'cat', stdin: true });
const regular = session.spawn({ command: 'cat' });
const disabled = session.spawn({ command: 'cat', stdin: false });
const dynamic = session.spawn({ command: 'cat', stdin });

expectTypeOf<VercelSandboxSession>().toExtend<SandboxSession>();
expectTypeOf<
  Awaited<typeof writable>
>().toEqualTypeOf<WritableSandboxProcess>();
expectTypeOf<Awaited<typeof writable>['stdin']>().toEqualTypeOf<
  WritableStream<Uint8Array>
>();
expectTypeOf<Awaited<typeof regular>>().toEqualTypeOf<SandboxProcess>();
expectTypeOf<Awaited<typeof disabled>>().toEqualTypeOf<SandboxProcess>();
expectTypeOf<Awaited<typeof regular>>().not.toHaveProperty('stdin');
expectTypeOf<Awaited<typeof disabled>>().not.toHaveProperty('stdin');
expectTypeOf<Awaited<typeof dynamic>>().toEqualTypeOf<
  SandboxProcess | WritableSandboxProcess
>();

declare const publicSession: ReturnType<
  typeof createVercelSandboxSessionFromNativeSandbox
>;
declare const networkSession: ReturnType<
  typeof createVercelNetworkSandboxSessionFromNativeSandbox
>;

const publicWritable = publicSession.spawn({ command: 'cat', stdin: true });
const networkWritable = networkSession.spawn({ command: 'cat', stdin: true });
const restrictedWritable = networkSession.restricted().spawn({
  command: 'cat',
  stdin: true,
});

expectTypeOf<Awaited<typeof publicWritable>['stdin']>().toEqualTypeOf<
  WritableStream<Uint8Array>
>();
expectTypeOf<Awaited<typeof networkWritable>['stdin']>().toEqualTypeOf<
  WritableStream<Uint8Array>
>();
expectTypeOf<Awaited<typeof restrictedWritable>['stdin']>().toEqualTypeOf<
  WritableStream<Uint8Array>
>();

type Options = VercelNetworkSandboxSessionCreateOptions;

expectTypeOf<{
  runtime: 'node24';
  ports: number[];
  template: HarnessV1SandboxTemplate;
  abortSignal: AbortSignal;
}>().toExtend<Options>();
expectTypeOf<{ image: string; signal: AbortSignal }>().toExtend<Options>();
expectTypeOf<{ sandboxId: string; runtime: 'node24' }>().toExtend<Options>();
expectTypeOf<{
  source: { type: 'git'; url: string; revision: string };
  ports: number[];
}>().toExtend<Options>();
expectTypeOf<{
  source: { type: 'snapshot'; snapshotId: string };
  template: HarnessV1SandboxTemplate;
  ports: number[];
}>().toExtend<Options>();
expectTypeOf<{ sandbox: VercelNativeSandboxSession }>().not.toExtend<Options>();
expectTypeOf<{
  source: { type: 'snapshot'; snapshotId: string };
  runtime: 'node24';
}>().not.toExtend<Options>();
expectTypeOf<{ image: string; runtime: 'node24' }>().not.toExtend<Options>();

type ResumeOptions = VercelNetworkSandboxSessionResumeOptions;
expectTypeOf<{
  sandboxId: string;
  token: string;
  teamId: string;
  projectId: string;
  fetch: typeof fetch;
  signal: AbortSignal;
  abortSignal: AbortSignal;
}>().toExtend<ResumeOptions>();
expectTypeOf<{}>().not.toExtend<ResumeOptions>();
expectTypeOf<{
  sandboxId: string;
  name: string;
}>().not.toExtend<ResumeOptions>();
expectTypeOf<ResumeOptions>().not.toHaveProperty('runtime');
expectTypeOf<ResumeOptions>().not.toHaveProperty('template');
