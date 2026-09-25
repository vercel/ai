import { shellQuote } from '@ai-sdk/harness/utils';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  defineCommand,
  InMemoryFs,
  MountableFs,
  ReadWriteFs,
  Sandbox,
  type IFileSystem,
} from 'just-bash';
import { describe, expect, it } from 'vitest';
import { createJustBashSandbox } from './just-bash-sandbox';

describe('JustBashSandboxProvider', () => {
  it('seeds realpath and resolves chained symlinks', async () => {
    const session = await createJustBashSandbox({
      cwd: '/work',
    }).createSession();

    try {
      await session.run({
        command: [
          'mkdir -p /work/target/docs',
          "printf 'content\\n' > /work/target/docs/read.txt",
          'ln -s target /work/intermediate',
          'ln -s intermediate/docs /work/linked-docs',
        ].join(' && '),
      });

      await expect(
        session.run({ command: 'realpath /work/linked-docs/read.txt' }),
      ).resolves.toMatchObject({
        exitCode: 0,
        stdout: '/work/target/docs/read.txt\n',
      });
    } finally {
      await session.destroy();
    }
  });

  it.each([
    {
      name: 'MountableFs',
      createFilesystem: async () => ({
        fs: new MountableFs({
          base: new InMemoryFs(),
          mounts: [{ mountPoint: '/data', filesystem: new InMemoryFs() }],
        }),
      }),
    },
    {
      name: 'ReadWriteFs',
      createFilesystem: async () => {
        const root = await mkdtemp(path.join(tmpdir(), 'sandbox-just-bash-'));
        return {
          fs: new ReadWriteFs({ root }),
          cleanup: () => rm(root, { recursive: true, force: true }),
        };
      },
    },
  ])(
    'keeps commands available while providing realpath on $name',
    async ({ createFilesystem }) => {
      const {
        fs,
        cleanup = async () => {},
      }: { fs: IFileSystem; cleanup?: () => Promise<void> } =
        await createFilesystem();
      await fs.mkdir('/work/target', { recursive: true });
      await fs.writeFile('/work/target/read.txt', 'content\n');
      const session = await createJustBashSandbox({ fs }).createSession();

      try {
        await expect(
          session.run({
            command: 'echo ok && realpath /work/target/read.txt',
          }),
        ).resolves.toMatchObject({
          exitCode: 0,
          stdout: 'ok\n/work/target/read.txt\n',
          stderr: '',
        });
      } finally {
        await session.destroy();
        await cleanup();
      }
    },
  );

  it('bootstraps caller-provided sandboxes without replacing realpath', async () => {
    const sandbox = await Sandbox.create({ cwd: '/work' });
    await sandbox.writeFiles({
      '/usr/bin/realpath': "#!/usr/bin/env bash\nprintf 'custom\\n'\n",
    });
    await sandbox.bashEnvInstance.fs.chmod('/usr/bin/realpath', 0o755);

    const session = await createJustBashSandbox({ sandbox }).createSession();

    try {
      await expect(
        session.run({ command: 'realpath /tmp' }),
      ).resolves.toMatchObject({
        exitCode: 0,
        stdout: 'custom\n',
      });
    } finally {
      await session.destroy();
    }
  });

  it('preserves a registered realpath command without a filesystem stub', async () => {
    const sandbox = await Sandbox.create({
      fs: new MountableFs({
        base: new InMemoryFs(),
        mounts: [{ mountPoint: '/data', filesystem: new InMemoryFs() }],
      }),
    });
    sandbox.bashEnvInstance.registerCommand(
      defineCommand('realpath', async () => ({
        exitCode: 0,
        stdout: 'custom\n',
        stderr: '',
      })),
    );

    const session = await createJustBashSandbox({ sandbox }).createSession();

    try {
      await expect(
        session.run({ command: 'realpath /tmp && echo ok' }),
      ).resolves.toMatchObject({
        exitCode: 0,
        stdout: 'custom\nok\n',
        stderr: '',
      });
    } finally {
      await session.destroy();
    }
  });

  it('preserves trailing newlines in symlink targets', async () => {
    const session = await createJustBashSandbox({
      cwd: '/work',
    }).createSession();

    try {
      const target = '/work/target\nfile';
      await session.writeTextFile({ path: target, content: 'content\n' });
      const setup = await session.run({
        command: `ln -s ${shellQuote('target\nfile')} ${shellQuote('/work/link')}`,
      });
      expect(setup.exitCode).toBe(0);

      await expect(
        session.run({ command: 'realpath /work/link' }),
      ).resolves.toMatchObject({
        exitCode: 0,
        stdout: `${target}\n`,
      });
    } finally {
      await session.destroy();
    }
  });
});
