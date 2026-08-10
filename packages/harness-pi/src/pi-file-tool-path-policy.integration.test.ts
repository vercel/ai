import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPiPathMapper } from './pi-paths';
import { createPiRemoteOps } from './pi-remote-ops';

const sandboxWorkDir = '/sandbox/workspace';
const artifactRoot = '/tmp/pi-artifacts';

let hostWorkDir: string;

beforeEach(() => {
  hostWorkDir = mkdtempSync(path.join(tmpdir(), 'pi-path-policy-'));
});

afterEach(() => {
  rmSync(hostWorkDir, { recursive: true, force: true });
});

describe('Pi file-tool path policy with JustBash', () => {
  it('enforces external allow and deny roots through the real sandbox provider', async () => {
    const provider = createJustBashSandbox();
    const session = await provider.createSession();
    const sandbox = session.restricted();
    const onFileChange = vi.fn();

    try {
      await sandbox.run({
        command: `mkdir -p ${sandboxWorkDir} ${artifactRoot}/private /etc`,
      });
      await sandbox.run({
        command: `ln -s /etc ${sandboxWorkDir}/outside-link`,
      });
      await sandbox.writeTextFile({
        path: `${artifactRoot}/private/secret.txt`,
        content: 'credential-secret',
      });
      await sandbox.writeTextFile({
        path: `${artifactRoot}/public.txt`,
        content: 'public-value',
      });
      await sandbox.writeTextFile({
        path: '/etc/secret.txt',
        content: 'outside-secret',
      });

      const paths = createPiPathMapper({
        hostWorkDir,
        sandboxWorkDir,
        fileToolPathPolicy: {
          writableRoots: [artifactRoot],
          deniedRoots: [`${artifactRoot}/private`],
        },
      });
      const operations = createPiRemoteOps({
        sandbox,
        paths,
        onFileChange,
      });

      await operations.writeFile(`${artifactRoot}/result.txt`, 'before');
      await expect(
        operations.editFile(`${artifactRoot}/result.txt`, 'before', 'after'),
      ).resolves.toBe('after');
      await expect(
        operations.readBuffer(`${artifactRoot}/result.txt`),
      ).resolves.toEqual(Buffer.from('after'));
      expect(onFileChange).not.toHaveBeenCalled();

      await expect(operations.listDirectory(artifactRoot)).resolves.toEqual([
        'public.txt',
        'result.txt',
      ]);
      await expect(operations.findFiles('**', artifactRoot)).resolves.toEqual([
        'public.txt',
        'result.txt',
      ]);
      await expect(
        operations.grepFiles('credential-secret', { path: artifactRoot }),
      ).resolves.toBe('No matches found');
      await expect(
        operations.grepFiles('public-value', { path: artifactRoot }),
      ).resolves.toContain(`${artifactRoot}/public.txt:1:public-value`);

      await expect(
        operations.readBuffer(`${artifactRoot}/private/secret.txt`),
      ).rejects.toThrow(/denied/);
      await expect(
        operations.readBuffer('./outside-link/secret.txt'),
      ).rejects.toThrow(/escapes the readable roots/);

      await operations.writeFile('./inside.txt', 'workspace-value');
      expect(onFileChange).toHaveBeenCalledOnce();
      expect(onFileChange).toHaveBeenCalledWith(
        'create',
        'inside.txt',
        Buffer.from('workspace-value'),
      );
    } finally {
      await session.destroy?.();
    }
  });

  it('canonicalizes configured symlink roots and prunes literal metacharacter paths', async () => {
    const provider = createJustBashSandbox();
    const session = await provider.createSession();
    const sandbox = session.restricted();
    const allowedAlias = '/tmp/pi-allowed-link';
    const allowedTarget = '/mnt/pi-allowed-target';
    const deniedAlias = '/tmp/pi-denied-link';
    const deniedTarget = '/mnt/pi-denied-target';

    try {
      await sandbox.run({
        command: `mkdir -p ${sandboxWorkDir} '${allowedTarget}/[private]' ${deniedTarget} && ln -s ${allowedTarget} ${allowedAlias} && ln -s ${deniedTarget} ${deniedAlias}`,
      });
      await sandbox.writeTextFile({
        path: `${allowedTarget}/[private]/secret.txt`,
        content: 'metacharacter-secret',
      });
      await sandbox.writeTextFile({
        path: `${deniedTarget}/secret.txt`,
        content: 'alias-secret',
      });

      const paths = createPiPathMapper({
        hostWorkDir,
        sandboxWorkDir,
        fileToolPathPolicy: {
          readableRoots: [deniedTarget],
          writableRoots: [allowedAlias],
          deniedRoots: [deniedAlias, `${allowedAlias}/[private]`],
        },
      });
      const operations = createPiRemoteOps({ sandbox, paths });

      await operations.writeFile(`${allowedAlias}/result.txt`, 'result');
      await expect(
        operations.readBuffer(`${allowedAlias}/result.txt`),
      ).resolves.toEqual(Buffer.from('result'));

      await expect(operations.listDirectory(allowedAlias)).resolves.toEqual([
        'result.txt',
      ]);
      await expect(operations.findFiles('**', allowedAlias)).resolves.toEqual([
        'result.txt',
      ]);
      await expect(
        operations.grepFiles('metacharacter-secret', { path: allowedAlias }),
      ).resolves.toBe('No matches found');

      await expect(
        operations.readBuffer(`${deniedTarget}/secret.txt`),
      ).rejects.toThrow(/denied by the file-tool policy/);
    } finally {
      await session.destroy?.();
    }
  });
});
