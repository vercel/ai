import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';
import { describe, expect, it } from 'vitest';
import { createPiPathMapper } from './pi-paths';
import { executePiSandboxRead } from './pi-read-operations';
import { createPiRemoteOps } from './pi-remote-ops';

describe('executePiSandboxRead with just-bash', () => {
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

      const result = await executePiSandboxRead(
        remoteOps,
        sandboxWorkDir,
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

  it('reads a file that only starts like an image as text', async () => {
    const sandboxWorkDir = '/sandbox/workspace';
    const session = await createJustBashSandbox({
      cwd: sandboxWorkDir,
    }).createSession();
    const sandbox = session.restricted();

    try {
      await sandbox.writeTextFile({
        path: `${sandboxWorkDir}/notes.txt`,
        content: 'BM is a text file',
      });
      const remoteOps = createPiRemoteOps({
        sandbox,
        paths: createPiPathMapper({ sandboxWorkDir }),
      });

      const result = await executePiSandboxRead(
        remoteOps,
        sandboxWorkDir,
        'tool-1',
        { path: `${sandboxWorkDir}/notes.txt` },
        undefined,
        undefined,
        undefined as never,
      );

      expect(result.content).toEqual([
        { type: 'text', text: 'BM is a text file' },
      ]);
    } finally {
      await session.destroy();
    }
  });
});
