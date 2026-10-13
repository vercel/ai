import {
  createReadToolDefinition,
  detectSupportedImageMimeTypeFromFile,
  type ReadOperations,
} from '@earendil-works/pi-coding-agent';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { PiRemoteOps } from './pi-remote-ops';

const PI_IMAGE_SNIFF_BYTES = 4100;

type PiReadToolExecuteArgs = Parameters<
  ReturnType<typeof createReadToolDefinition>['execute']
>;

export function executePiSandboxRead(
  remoteOps: PiRemoteOps,
  sessionWorkDir: string,
  ...args: PiReadToolExecuteArgs
) {
  const [, { path: sandboxPath }] = args;
  return createReadToolDefinition(sessionWorkDir, {
    operations: createSandboxReadOperations(remoteOps, sandboxPath),
  }).execute(...args);
}

// Pi resolves the path with the host's path rules before it calls these: it
// rewrites Unicode spaces and, on a Windows host, turns a POSIX sandbox path
// into a drive path.
function createSandboxReadOperations(
  remoteOps: PiRemoteOps,
  sandboxPath: string,
): ReadOperations {
  let read: Promise<Buffer> | undefined;
  const readFile = (): Promise<Buffer> =>
    (read ??= remoteOps.readBuffer(sandboxPath));
  return {
    readFile,
    async access() {
      await readFile();
    },
    // Pi exports its image sniffer only for host files.
    async detectImageMimeType() {
      const head = (await readFile()).subarray(0, PI_IMAGE_SNIFF_BYTES);
      const dir = await mkdtemp(path.join(tmpdir(), 'ai-sdk-harness-pi-read-'));
      try {
        const file = path.join(dir, 'head');
        await writeFile(file, head);
        return await detectSupportedImageMimeTypeFromFile(file);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
}
