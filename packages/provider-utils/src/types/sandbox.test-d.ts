import { expectTypeOf, test } from 'vitest';
import type {
  Experimental_Sandbox,
  Experimental_SandboxProcess,
} from './sandbox';

test('Experimental_Sandbox exposes spawn returning a process handle', () => {
  expectTypeOf<Experimental_Sandbox['spawn']>().toBeFunction();
  expectTypeOf<Parameters<Experimental_Sandbox['spawn']>[0]>().toEqualTypeOf<{
    command: string;
    workingDirectory?: string;
    abortSignal?: AbortSignal;
  }>();
  expectTypeOf<
    Awaited<ReturnType<Experimental_Sandbox['spawn']>>
  >().toEqualTypeOf<Experimental_SandboxProcess>();
});

test('Experimental_SandboxProcess exposes the expected handle shape', () => {
  expectTypeOf<Experimental_SandboxProcess['pid']>().toEqualTypeOf<
    number | undefined
  >();
  expectTypeOf<Experimental_SandboxProcess['stdout']>().toEqualTypeOf<
    ReadableStream<Uint8Array>
  >();
  expectTypeOf<Experimental_SandboxProcess['stderr']>().toEqualTypeOf<
    ReadableStream<Uint8Array>
  >();
  expectTypeOf<
    Awaited<ReturnType<Experimental_SandboxProcess['wait']>>
  >().toEqualTypeOf<{ exitCode: number }>();
  expectTypeOf<
    Awaited<ReturnType<Experimental_SandboxProcess['kill']>>
  >().toEqualTypeOf<void>();
});
