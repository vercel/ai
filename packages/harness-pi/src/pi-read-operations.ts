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
  return createReadToolDefinition(sessionWorkDir, {
    operations: createSandboxReadOperations(remoteOps),
  }).execute(...args);
}

function createSandboxReadOperations(remoteOps: PiRemoteOps): ReadOperations {
  const reads = new Map<string, Promise<Buffer>>();
  const readFile = (absolutePath: string): Promise<Buffer> => {
    let read = reads.get(absolutePath);
    if (read == null) {
      read = remoteOps.readBuffer(absolutePath);
      reads.set(absolutePath, read);
    }
    return read;
  };
  return {
    readFile,
    async access(absolutePath) {
      await readFile(absolutePath);
    },
    // Pi exports its image sniffer only for host files.
    async detectImageMimeType(absolutePath) {
      const head = (await readFile(absolutePath)).subarray(
        0,
        PI_IMAGE_SNIFF_BYTES,
      );
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
