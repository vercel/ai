import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';

export function delegateSandboxOperations(
  resolve: () => PromiseLike<SandboxSession>,
): Omit<SandboxSession, 'description'> {
  return {
    readFile: async options => (await resolve()).readFile(options),
    readBinaryFile: async options => (await resolve()).readBinaryFile(options),
    readTextFile: async options => (await resolve()).readTextFile(options),
    writeFile: async options => (await resolve()).writeFile(options),
    writeBinaryFile: async options =>
      (await resolve()).writeBinaryFile(options),
    writeTextFile: async options => (await resolve()).writeTextFile(options),
    spawn: async options => (await resolve()).spawn(options),
    run: async options => (await resolve()).run(options),
  };
}
