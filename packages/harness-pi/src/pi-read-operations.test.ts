import { createReadToolDefinition } from '@earendil-works/pi-coding-agent';
import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';
import { describe, expect, it } from 'vitest';
import { createPiPathMapper } from './pi-paths';
import {
  createPiSandboxReadOperations,
  detectPiImageMimeType,
} from './pi-read-operations';
import { createPiRemoteOps } from './pi-remote-ops';

describe('detectPiImageMimeType', () => {
  it.each([
    ['image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]],
    ['image/jpeg', [0xff, 0xd8, 0xff, 0xe0]],
    ['image/gif', [...Buffer.from('GIF89a')]],
    ['image/webp', [...Buffer.from('RIFF\0\0\0\0WEBPVP8 ')]],
    ['image/bmp', [...Buffer.from('BM'), ...Array(12).fill(0), 40, 0, 0, 0]],
  ])('detects %s from its magic bytes', (mimeType, bytes) => {
    expect(detectPiImageMimeType(Uint8Array.from(bytes))).toBe(mimeType);
  });

  it('treats other content as text', () => {
    expect(detectPiImageMimeType(Buffer.from('RIFF\0\0\0\0WAVEfmt '))).toBe(
      undefined,
    );
    expect(detectPiImageMimeType(Buffer.from('hello'))).toBe(undefined);
    expect(detectPiImageMimeType(Buffer.from('BM is a text file'))).toBe(
      undefined,
    );
    expect(detectPiImageMimeType(new Uint8Array())).toBe(undefined);
  });
});

describe('createPiSandboxReadOperations with just-bash', () => {
  it("lets Pi's read tool return a sandbox image as an image block", async () => {
    const sandboxWorkDir = '/sandbox/workspace';
    const session = await createJustBashSandbox({
      cwd: sandboxWorkDir,
    }).createSession();
    const sandbox = session.restricted();

    try {
      await sandbox.writeBinaryFile({
        path: `${sandboxWorkDir}/pixel.png`,
        content: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          'base64',
        ),
      });
      const remoteOps = createPiRemoteOps({
        sandbox,
        paths: createPiPathMapper({
          sandboxWorkDir,
        }),
      });

      const result = await createReadToolDefinition(sandboxWorkDir, {
        operations: createPiSandboxReadOperations(remoteOps),
      }).execute(
        'tool-1',
        { path: `${sandboxWorkDir}/pixel.png` },
        undefined,
        undefined,
        undefined as never,
      );

      expect(result.content).toEqual([
        { type: 'text', text: 'Read image file [image/png]' },
        { type: 'image', mimeType: 'image/png', data: expect.any(String) },
      ]);
    } finally {
      await session.destroy();
    }
  });
});
