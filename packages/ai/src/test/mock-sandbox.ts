import type {
  Experimental_Sandbox,
  Experimental_SandboxProcess,
} from '@ai-sdk/provider-utils';

/**
 * No-op stubs for the file and spawn methods on `Experimental_Sandbox`,
 * intended to be spread into test fixtures that only care about `runCommand`.
 */
export const mockSandboxFileStubs: Pick<
  Experimental_Sandbox,
  | 'readFile'
  | 'readBinaryFile'
  | 'readTextFile'
  | 'writeFile'
  | 'writeBinaryFile'
  | 'writeTextFile'
  | 'spawnCommand'
> = {
  readFile: async () => null,
  readBinaryFile: async () => null,
  readTextFile: async () => null,
  writeFile: async () => {},
  writeBinaryFile: async () => {},
  writeTextFile: async () => {},
  spawnCommand: async (): Promise<Experimental_SandboxProcess> => ({
    stdout: new ReadableStream<Uint8Array>({ start: c => c.close() }),
    stderr: new ReadableStream<Uint8Array>({ start: c => c.close() }),
    wait: async () => ({ exitCode: 0 }),
    kill: async () => {},
  }),
};
