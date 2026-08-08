import { expectTypeOf, test } from 'vitest';
import type { SandboxSession, SandboxProcess } from './sandbox';

test('SandboxSession exposes spawn returning a process handle', () => {
  expectTypeOf<SandboxSession['spawn']>().toBeFunction();
  expectTypeOf<Parameters<SandboxSession['spawn']>[0]>().toEqualTypeOf<{
    command: string;
    workingDirectory?: string;
    env?: Record<string, string>;
    abortSignal?: AbortSignal;
  }>();
  expectTypeOf<
    Awaited<ReturnType<SandboxSession['spawn']>>
  >().toEqualTypeOf<SandboxProcess>();
});

test('legacy command-only spawn implementations remain structurally compatible', () => {
  const legacySpawn = async (_options: {
    command: string;
    workingDirectory?: string;
    env?: Record<string, string>;
    abortSignal?: AbortSignal;
  }): Promise<SandboxProcess> => ({}) as SandboxProcess;

  const legacySession = { spawn: legacySpawn } satisfies Pick<
    SandboxSession,
    'spawn'
  >;
  expectTypeOf(legacySession.spawn).toMatchTypeOf<SandboxSession['spawn']>();
});

test('SandboxSession optionally exposes provider-owned path operations', () => {
  expectTypeOf<SandboxSession['homeDirectory']>().toEqualTypeOf<
    string | undefined
  >();
  expectTypeOf<SandboxSession['resolvePath']>().toEqualTypeOf<
    | ((options: { base?: string; segments: ReadonlyArray<string> }) => string)
    | undefined
  >();
  expectTypeOf<SandboxSession['ensureDirectory']>().toEqualTypeOf<
    | ((options: {
        path: string;
        recursive: true;
        abortSignal?: AbortSignal;
      }) => PromiseLike<void>)
    | undefined
  >();
  expectTypeOf<SandboxSession['spawnExecutable']>().toMatchTypeOf<
    | ((options: {
        executable: string;
        args?: ReadonlyArray<string>;
        workingDirectory?: string;
        env?: Record<string, string>;
        abortSignal?: AbortSignal;
      }) => PromiseLike<SandboxProcess>)
    | undefined
  >();
});

test('SandboxProcess exposes the expected handle shape', () => {
  expectTypeOf<SandboxProcess['pid']>().toEqualTypeOf<number | undefined>();
  expectTypeOf<SandboxProcess['stdout']>().toEqualTypeOf<
    ReadableStream<Uint8Array>
  >();
  expectTypeOf<SandboxProcess['stderr']>().toEqualTypeOf<
    ReadableStream<Uint8Array>
  >();
  expectTypeOf<Awaited<ReturnType<SandboxProcess['wait']>>>().toEqualTypeOf<{
    exitCode: number;
  }>();
  expectTypeOf<
    Awaited<ReturnType<SandboxProcess['kill']>>
  >().toEqualTypeOf<void>();
});
