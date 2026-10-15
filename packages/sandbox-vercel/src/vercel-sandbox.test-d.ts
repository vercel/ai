import { expectTypeOf } from 'vitest';
import type { HarnessV1SandboxTemplate } from '@ai-sdk/harness';
import type {
  VercelNativeSandboxSession,
  VercelNetworkSandboxSessionCreateOptions,
  VercelNetworkSandboxSessionResumeOptions,
} from './vercel-sandbox';

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
