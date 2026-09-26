export function isNodeRuntime(): boolean {
  const runtimeProcess = globalThis.process as
    | {
        release?: { name?: string };
        title?: string;
        versions?: { bun?: string; deno?: string };
      }
    | undefined;

  // Node-compatible process objects do not imply support for Node DNS/socket
  // hooks. Workers identifies itself as workerd, including without navigator.
  return (
    runtimeProcess?.release?.name === 'node' &&
    runtimeProcess.versions?.bun == null &&
    runtimeProcess.versions?.deno == null &&
    runtimeProcess.title !== 'workerd' &&
    (globalThis as { EdgeRuntime?: unknown }).EdgeRuntime == null
  );
}
