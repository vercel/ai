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

test('SandboxSession exposes text reads with optional line ranges', () => {
  type Options = Parameters<SandboxSession['readTextFile']>[0];

  expectTypeOf<Options['path']>().toEqualTypeOf<string>();
  expectTypeOf<Options['abortSignal']>().toEqualTypeOf<
    AbortSignal | undefined
  >();
  expectTypeOf<Options['encoding']>().toEqualTypeOf<string | undefined>();
  expectTypeOf<Options['startLine']>().toEqualTypeOf<number | undefined>();
  expectTypeOf<Options['endLine']>().toEqualTypeOf<number | undefined>();
  expectTypeOf<
    Awaited<ReturnType<SandboxSession['readTextFile']>>
  >().toEqualTypeOf<string | null>();
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
