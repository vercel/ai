import type { Experimental_Sandbox } from '@ai-sdk/provider-utils';

/**
 * No-op stubs for the file methods on `Experimental_Sandbox`, intended to be
 * spread into test fixtures that only care about `runCommand`.
 */
export const mockSandboxFileStubs: Pick<
  Experimental_Sandbox,
  | 'readFile'
  | 'readBinaryFile'
  | 'readTextFile'
  | 'writeFile'
  | 'writeBinaryFile'
  | 'writeTextFile'
> = {
  readFile: async () => null,
  readBinaryFile: async () => null,
  readTextFile: async () => null,
  writeFile: async () => {},
  writeBinaryFile: async () => {},
  writeTextFile: async () => {},
};
