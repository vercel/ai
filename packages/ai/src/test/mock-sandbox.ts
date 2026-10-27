import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';

/**
 * File stubs and an unimplemented spawn method on `Experimental_SandboxSession`,
 * intended to be spread into test fixtures that only care about `run`.
 */
export const mockSandboxSessionFileStubs: Pick<
  Experimental_SandboxSession,
  | 'readFile'
  | 'readBinaryFile'
  | 'readTextFile'
  | 'writeFile'
  | 'writeBinaryFile'
  | 'writeTextFile'
  | 'spawn'
> = {
  readFile: async () => null,
  readBinaryFile: async () => null,
  readTextFile: async () => null,
  writeFile: async () => {},
  writeBinaryFile: async () => {},
  writeTextFile: async () => {},
  spawn: async () => {
    throw new Error('spawn is not implemented in this mock.');
  },
};
