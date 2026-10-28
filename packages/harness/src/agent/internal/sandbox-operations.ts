import type {
  Experimental_SandboxProcess as SandboxProcess,
  Experimental_SandboxSession as SandboxSession,
  Experimental_SandboxSpawnOptions as SpawnOptions,
  Experimental_SandboxSpawnOptionsWithStdin as SpawnOptionsWithStdin,
  Experimental_SandboxSpawnOptionsWithoutStdin as SpawnOptionsWithoutStdin,
  Experimental_WritableSandboxProcess as WritableSandboxProcess,
} from '@ai-sdk/provider-utils';

export function delegateSandboxOperations(
  resolve: () => PromiseLike<SandboxSession>,
): Omit<SandboxSession, 'description'> {
  function spawn(
    options: SpawnOptionsWithStdin,
  ): Promise<WritableSandboxProcess>;
  function spawn(options: SpawnOptionsWithoutStdin): Promise<SandboxProcess>;
  function spawn(
    options: SpawnOptions,
  ): Promise<SandboxProcess | WritableSandboxProcess>;
  async function spawn(options: SpawnOptions) {
    return (await resolve()).spawn(options);
  }

  return {
    readFile: async options => (await resolve()).readFile(options),
    readBinaryFile: async options => (await resolve()).readBinaryFile(options),
    readTextFile: async options => (await resolve()).readTextFile(options),
    writeFile: async options => (await resolve()).writeFile(options),
    writeBinaryFile: async options =>
      (await resolve()).writeBinaryFile(options),
    writeTextFile: async options => (await resolve()).writeTextFile(options),
    spawn,
    run: async options => (await resolve()).run(options),
  };
}
