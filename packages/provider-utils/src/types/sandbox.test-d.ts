import { expectTypeOf, test } from 'vitest';
import type {
  Experimental_SandboxRunOptions,
  Experimental_SandboxReadFileOptions,
  Experimental_SandboxReadBinaryFileOptions,
  Experimental_SandboxReadTextFileOptions,
  Experimental_SandboxSpawnOptions,
  Experimental_SandboxSpawnOptionsWithStdin,
  Experimental_SandboxSpawnOptionsWithoutStdin,
  Experimental_SandboxWriteFileOptions,
  Experimental_SandboxWriteBinaryFileOptions,
  Experimental_SandboxWriteTextFileOptions,
  Experimental_SandboxStatOptions,
  Experimental_SandboxListDirectoryOptions,
  Experimental_SandboxDeleteFileOptions,
} from '../index';
import type {
  SandboxSession,
  SandboxProcess,
  SandboxRunOptions,
  SandboxReadFileOptions,
  SandboxReadBinaryFileOptions,
  SandboxReadTextFileOptions,
  SandboxSpawnOptions,
  SandboxSpawnOptionsWithStdin,
  SandboxSpawnOptionsWithoutStdin,
  SandboxWriteFileOptions,
  SandboxWriteBinaryFileOptions,
  SandboxWriteTextFileOptions,
  SandboxStatOptions,
  SandboxListDirectoryOptions,
  SandboxDeleteFileOptions,
  WritableSandboxProcess,
} from './sandbox';

test('sandbox method options are exported experimentally', () => {
  expectTypeOf<Experimental_SandboxRunOptions>().toEqualTypeOf<SandboxRunOptions>();
  expectTypeOf<Experimental_SandboxReadFileOptions>().toEqualTypeOf<SandboxReadFileOptions>();
  expectTypeOf<Experimental_SandboxReadBinaryFileOptions>().toEqualTypeOf<SandboxReadBinaryFileOptions>();
  expectTypeOf<Experimental_SandboxReadTextFileOptions>().toEqualTypeOf<SandboxReadTextFileOptions>();
  expectTypeOf<Experimental_SandboxWriteFileOptions>().toEqualTypeOf<SandboxWriteFileOptions>();
  expectTypeOf<Experimental_SandboxWriteBinaryFileOptions>().toEqualTypeOf<SandboxWriteBinaryFileOptions>();
  expectTypeOf<Experimental_SandboxWriteTextFileOptions>().toEqualTypeOf<SandboxWriteTextFileOptions>();
  expectTypeOf<Experimental_SandboxStatOptions>().toEqualTypeOf<SandboxStatOptions>();
  expectTypeOf<Experimental_SandboxListDirectoryOptions>().toEqualTypeOf<SandboxListDirectoryOptions>();
  expectTypeOf<Experimental_SandboxDeleteFileOptions>().toEqualTypeOf<SandboxDeleteFileOptions>();
});

test('SandboxSession methods use their named options types', () => {
  expectTypeOf<
    Parameters<SandboxSession['run']>[0]
  >().toEqualTypeOf<SandboxRunOptions>();
  expectTypeOf<
    Parameters<SandboxSession['readFile']>[0]
  >().toEqualTypeOf<SandboxReadFileOptions>();
  expectTypeOf<
    Parameters<SandboxSession['readBinaryFile']>[0]
  >().toEqualTypeOf<SandboxReadBinaryFileOptions>();
  expectTypeOf<
    Parameters<SandboxSession['readTextFile']>[0]
  >().toEqualTypeOf<SandboxReadTextFileOptions>();
  expectTypeOf<
    Parameters<SandboxSession['writeFile']>[0]
  >().toEqualTypeOf<SandboxWriteFileOptions>();
  expectTypeOf<
    Parameters<SandboxSession['writeBinaryFile']>[0]
  >().toEqualTypeOf<SandboxWriteBinaryFileOptions>();
  expectTypeOf<
    Parameters<SandboxSession['writeTextFile']>[0]
  >().toEqualTypeOf<SandboxWriteTextFileOptions>();
  expectTypeOf<
    Parameters<SandboxSession['stat']>[0]
  >().toEqualTypeOf<SandboxStatOptions>();
  expectTypeOf<
    Parameters<SandboxSession['listDirectory']>[0]
  >().toEqualTypeOf<SandboxListDirectoryOptions>();
  expectTypeOf<
    Parameters<SandboxSession['deleteFile']>[0]
  >().toEqualTypeOf<SandboxDeleteFileOptions>();
});

test('run options preserve command fields without stdin', () => {
  expectTypeOf<SandboxRunOptions>().toEqualTypeOf<{
    command: string;
    workingDirectory?: string;
    env?: Record<string, string>;
    abortSignal?: AbortSignal;
  }>();
  expectTypeOf<SandboxRunOptions>().not.toHaveProperty('stdin');
});

test('file read options preserve path, signal, and text fields', () => {
  expectTypeOf<SandboxReadFileOptions>().toEqualTypeOf<{
    path: string;
    abortSignal?: AbortSignal;
  }>();
  expectTypeOf<SandboxReadBinaryFileOptions>().toEqualTypeOf<SandboxReadFileOptions>();
  expectTypeOf<SandboxReadTextFileOptions>().toEqualTypeOf<
    SandboxReadFileOptions & {
      encoding?: string;
      startLine?: number;
      endLine?: number;
    }
  >();
  expectTypeOf<SandboxStatOptions>().toEqualTypeOf<SandboxReadFileOptions>();
  expectTypeOf<SandboxListDirectoryOptions>().toEqualTypeOf<SandboxReadFileOptions>();
  expectTypeOf<SandboxDeleteFileOptions>().toEqualTypeOf<SandboxReadFileOptions>();
});

test('file write options preserve their payload types and text encoding', () => {
  expectTypeOf<SandboxWriteFileOptions>().toEqualTypeOf<{
    path: string;
    content: ReadableStream<Uint8Array>;
    abortSignal?: AbortSignal;
  }>();
  expectTypeOf<SandboxWriteBinaryFileOptions>().toEqualTypeOf<{
    path: string;
    content: Uint8Array;
    abortSignal?: AbortSignal;
  }>();
  expectTypeOf<SandboxWriteTextFileOptions>().toEqualTypeOf<
    {
      path: string;
      content: string;
      abortSignal?: AbortSignal;
    } & { encoding?: string }
  >();
});

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
