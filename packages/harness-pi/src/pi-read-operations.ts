import type { ReadOperations } from '@earendil-works/pi-coding-agent';
import type { PiRemoteOps } from './pi-remote-ops';

/**
 * Detects the image formats Pi's read tool sends as image blocks from their
 * magic bytes. Pi only exports a detector that opens a host file.
 */
export function detectPiImageMimeType(bytes: Uint8Array): string | undefined {
  const startsWith = (signature: number[], offset = 0) =>
    signature.every((byte, index) => bytes[offset + index] === byte);
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (startsWith([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith([0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  if (
    startsWith([0x52, 0x49, 0x46, 0x46]) &&
    startsWith([0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'image/webp';
  }
  if (startsWith([0x42, 0x4d]) && bytes.length >= 18) {
    const dibHeaderSize = Buffer.from(bytes).readUInt32LE(14);
    if ([12, 40, 52, 56, 64, 108, 124].includes(dibHeaderSize)) {
      return 'image/bmp';
    }
  }
  return undefined;
}

/**
 * Pi's read tool operations over the sandbox. Pi checks access, sniffs the
 * image type and reads the file as three calls; they share one sandbox read.
 * Create one instance per tool execution so a later read sees fresh content.
 */
export function createPiSandboxReadOperations(
  remoteOps: PiRemoteOps,
): ReadOperations {
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
    async detectImageMimeType(absolutePath) {
      return detectPiImageMimeType(await readFile(absolutePath));
    },
  };
}
