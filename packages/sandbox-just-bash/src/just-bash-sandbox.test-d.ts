import { expectTypeOf } from 'vitest';
import type { HarnessV1SandboxTemplate } from '@ai-sdk/harness';
import type {
  Experimental_SandboxProcess as SandboxProcess,
  Experimental_SandboxSession as SandboxSession,
} from '@ai-sdk/provider-utils';
import type {
  createJustBashNetworkSandboxSessionFromNativeSandbox,
  createJustBashSandboxSessionFromNativeSandbox,
  JustBashNativeSandboxSession,
  JustBashNetworkSandboxSessionCreateOptions,
  JustBashNetworkSandboxSessionResumeOptions,
} from './just-bash-sandbox';
import type { JustBashSandboxSession } from './just-bash-sandbox-session';

declare const session: JustBashSandboxSession;
declare const stdin: boolean;

const unsupported = session.spawn({ command: 'cat', stdin: true });
const regular = session.spawn({ command: 'cat' });
const disabled = session.spawn({ command: 'cat', stdin: false });
const dynamic = session.spawn({ command: 'cat', stdin });

expectTypeOf<JustBashSandboxSession>().toExtend<SandboxSession>();
expectTypeOf<Awaited<typeof unsupported>>().toBeNever();
expectTypeOf<Awaited<typeof regular>>().toEqualTypeOf<SandboxProcess>();
expectTypeOf<Awaited<typeof disabled>>().toEqualTypeOf<SandboxProcess>();
expectTypeOf<Awaited<typeof dynamic>>().toEqualTypeOf<SandboxProcess>();
expectTypeOf<Awaited<typeof regular>>().not.toHaveProperty('stdin');
expectTypeOf<Awaited<typeof disabled>>().not.toHaveProperty('stdin');

declare const publicSession: ReturnType<
  typeof createJustBashSandboxSessionFromNativeSandbox
>;
declare const networkSession: ReturnType<
  typeof createJustBashNetworkSandboxSessionFromNativeSandbox
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
