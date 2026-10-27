import { expectTypeOf, test } from 'vitest';
import type {
  Experimental_SandboxSpawnOptions,
  Experimental_SandboxSpawnOptionsWithStdin,
  Experimental_SandboxSpawnOptionsWithoutStdin,
} from './index';
import type {
  SandboxSession,
  SandboxProcess,
  SandboxSpawnOptions,
  SandboxSpawnOptionsWithStdin,
  SandboxSpawnOptionsWithoutStdin,
  WritableSandboxProcess,
} from './sandbox';

test('SandboxSession exposes spawn returning a process handle', () => {
  expectTypeOf<SandboxSession['spawn']>().toBeFunction();
  expectTypeOf<
    Parameters<SandboxSession['spawn']>[0]
  >().toEqualTypeOf<SandboxSpawnOptions>();
  expectTypeOf<Awaited<ReturnType<SandboxSession['spawn']>>>().toEqualTypeOf<
    SandboxProcess | WritableSandboxProcess
  >();
});

test('spawn option types expose the expected stdin variants', () => {
  expectTypeOf<Experimental_SandboxSpawnOptions>().toEqualTypeOf<SandboxSpawnOptions>();
  expectTypeOf<Experimental_SandboxSpawnOptionsWithStdin>().toEqualTypeOf<SandboxSpawnOptionsWithStdin>();
  expectTypeOf<Experimental_SandboxSpawnOptionsWithoutStdin>().toEqualTypeOf<SandboxSpawnOptionsWithoutStdin>();
  expectTypeOf<{
    command: string;
  }>().toExtend<SandboxSpawnOptionsWithoutStdin>();
  expectTypeOf<{
    command: string;
    stdin: false;
  }>().toExtend<SandboxSpawnOptionsWithoutStdin>();
  expectTypeOf<{
    command: string;
    stdin: true;
  }>().not.toExtend<SandboxSpawnOptionsWithoutStdin>();
  expectTypeOf<{
    command: string;
    stdin: true;
  }>().toExtend<SandboxSpawnOptionsWithStdin>();
  expectTypeOf<{
    command: string;
  }>().not.toExtend<SandboxSpawnOptionsWithStdin>();
  expectTypeOf<{
    command: string;
    stdin: false;
  }>().not.toExtend<SandboxSpawnOptionsWithStdin>();
  expectTypeOf<{
    command: string;
    stdin: boolean;
  }>().toExtend<SandboxSpawnOptions>();
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
