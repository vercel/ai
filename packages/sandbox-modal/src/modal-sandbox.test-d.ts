import { expectTypeOf } from 'vitest';
import type {
  HarnessV1NetworkSandboxSession,
  HarnessV1SandboxTemplate,
} from '@ai-sdk/harness';
import type {
  Experimental_SandboxProcess as SandboxProcess,
  Experimental_SandboxSession as SandboxSession,
  Experimental_WritableSandboxProcess as WritableSandboxProcess,
} from '@ai-sdk/provider-utils';
import type {
  ExperimentalOutboundPolicy,
  Image,
  ModalClient,
  Sandbox,
} from 'modal';
import type {
  ModalNativeSandboxSession,
  ModalNetworkSandboxSessionCreateOptions,
  ModalNetworkSandboxSessionResumeOptions,
  createModalNetworkSandboxSession,
  createModalNetworkSandboxSessionFromNativeSandbox,
  createModalSandboxSessionFromNativeSandbox,
  resumeModalNetworkSandboxSession,
} from './modal-sandbox';
import type { ModalSandboxSession } from './modal-sandbox-session';

declare const session: ModalSandboxSession;
declare const stdin: boolean;

const writable = session.spawn({ command: 'cat', stdin: true });
const regular = session.spawn({ command: 'cat' });
const disabled = session.spawn({ command: 'cat', stdin: false });
const dynamic = session.spawn({ command: 'cat', stdin });

expectTypeOf<ModalSandboxSession>().toExtend<SandboxSession>();
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

declare const networkSession: ReturnType<
  typeof createModalNetworkSandboxSessionFromNativeSandbox
>;

const networkWritable = networkSession.spawn({ command: 'cat', stdin: true });
const restrictedWritable = networkSession.restricted().spawn({
  command: 'cat',
  stdin: true,
});

expectTypeOf<Awaited<typeof networkWritable>['stdin']>().toEqualTypeOf<
  WritableStream<Uint8Array>
>();
expectTypeOf<Awaited<typeof restrictedWritable>['stdin']>().toEqualTypeOf<
  WritableStream<Uint8Array>
>();

type Options = ModalNetworkSandboxSessionCreateOptions;

expectTypeOf<{}>().toExtend<Options>();
expectTypeOf<{
  image: string;
  encryptedPorts: number[];
  template: HarnessV1SandboxTemplate;
  abortSignal: AbortSignal;
}>().toExtend<Options>();
expectTypeOf<{
  client: ModalClient;
  appName: string;
  image: Image;
}>().toExtend<Options>();
expectTypeOf<{ sandboxId: string }>().toExtend<Options>();
expectTypeOf<{ name: string }>().not.toExtend<Options>();
expectTypeOf<{
  timeoutMs: number;
  workdir: string;
  cpu: number;
  memoryMiB: number;
  env: Record<string, string>;
  unencryptedPorts: number[];
  blockNetwork: boolean;
}>().toExtend<Options>();
expectTypeOf<{ sandbox: Sandbox }>().not.toExtend<Options>();
expectTypeOf<{ h2Ports: number[] }>().not.toExtend<Options>();
expectTypeOf<{ image: number }>().not.toExtend<Options>();
expectTypeOf<{ requestTransformations: boolean }>().toExtend<Options>();
// The session owns the outbound policy of a sandbox it transforms requests for.
expectTypeOf<{
  experimentalOutboundPolicy: ExperimentalOutboundPolicy;
}>().not.toExtend<Options>();

type ResumeOptions = ModalNetworkSandboxSessionResumeOptions;
expectTypeOf<{
  sandboxId: string;
  client: ModalClient;
  appName: string;
  abortSignal: AbortSignal;
}>().toExtend<ResumeOptions>();
expectTypeOf<{ sandboxId: string }>().toExtend<ResumeOptions>();
// Creation options are accepted for restoring a stopped sandbox.
expectTypeOf<{
  sandboxId: string;
  encryptedPorts: number[];
  timeoutMs: number;
  cpu: number;
  env: Record<string, string>;
  blockNetwork: boolean;
  outboundCidrAllowlist: string[];
  outboundDomainAllowlist: string[];
}>().toExtend<ResumeOptions>();
expectTypeOf<{}>().not.toExtend<ResumeOptions>();
expectTypeOf<{
  sandboxId: string;
  name: string;
}>().not.toExtend<ResumeOptions>();
expectTypeOf<{
  sandboxId: string;
  h2Ports: number[];
}>().not.toExtend<ResumeOptions>();
expectTypeOf<{
  sandboxId: string;
  requestTransformations: boolean;
  blockNetwork: boolean;
}>().toExtend<ResumeOptions>();
expectTypeOf<{
  sandboxId: string;
  experimentalOutboundPolicy: ExperimentalOutboundPolicy;
}>().not.toExtend<ResumeOptions>();
expectTypeOf<ResumeOptions>().not.toHaveProperty('image');
expectTypeOf<ResumeOptions>().not.toHaveProperty('template');

expectTypeOf<{
  sandbox: Sandbox;
  workdir: string;
}>().toExtend<ModalNativeSandboxSession>();
expectTypeOf<{
  sandbox: Sandbox;
  workdir: string;
  encryptedPorts: number[];
}>().toExtend<ModalNativeSandboxSession>();
expectTypeOf<Sandbox>().not.toExtend<ModalNativeSandboxSession>();
expectTypeOf<{ sandbox: Sandbox }>().not.toExtend<ModalNativeSandboxSession>();

expectTypeOf<typeof createModalNetworkSandboxSession>().returns.toEqualTypeOf<
  Promise<HarnessV1NetworkSandboxSession>
>();
expectTypeOf<typeof resumeModalNetworkSandboxSession>().returns.toEqualTypeOf<
  Promise<HarnessV1NetworkSandboxSession>
>();
expectTypeOf<
  typeof createModalSandboxSessionFromNativeSandbox
>().returns.toEqualTypeOf<SandboxSession>();
expectTypeOf<
  typeof createModalNetworkSandboxSessionFromNativeSandbox
>().returns.toEqualTypeOf<HarnessV1NetworkSandboxSession>();
