import { Sandbox } from 'just-bash';
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
});
