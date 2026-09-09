import { execFile } from 'node:child_process';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  type ACPImplementation,
  getImplementationInstallScript,
} from './implementation';

const execFileAsync = promisify(execFile);

describe('getImplementationInstallScript', () => {
  it('installs into the harness-owned implementation directory', async () => {
    const implementation = {
      source: {
        type: 'install-command',
        command: [
          'mkdir -p "$HOME/.local/share/acp-agent/versions/1.0.0" "$HOME/.local/bin"',
          `printf '#!/usr/bin/env bash\\nexit 0\\n' > "$HOME/.local/share/acp-agent/versions/1.0.0/acp-agent"`,
          'chmod +x "$HOME/.local/share/acp-agent/versions/1.0.0/acp-agent"',
          'ln -s "$HOME/.local/share/acp-agent/versions/1.0.0/acp-agent" "$HOME/.local/bin/acp-agent"',
          'pwd > "$HOME/install-working-directory.txt"',
        ].join('\n'),
      },
      executable: 'acp-agent',
    } as const satisfies ACPImplementation;
    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), 'ai-sdk-harness-acp-install-'),
    );
    const implementationDirectory = join(
      temporaryDirectory,
      '.harness-bootstrap',
      'example-acp',
      'implementation',
    );
    const ambientHome = join(temporaryDirectory, 'ambient-home');
    const scriptPath = join(implementationDirectory, 'install.sh');
    await mkdir(implementationDirectory, { recursive: true });
    await mkdir(ambientHome, { recursive: true });
    await writeFile(
      scriptPath,
      getImplementationInstallScript({ implementation })!,
    );

    try {
      await execFileAsync('bash', [scriptPath], {
        env: { ...process.env, HOME: ambientHome },
      });

      const installationHome = join(implementationDirectory, 'home');
      const executableTarget = join(
        installationHome,
        '.local',
        'share',
        'acp-agent',
        'versions',
        '1.0.0',
        'acp-agent',
      );
      await expect(
        realpath(join(installationHome, '.local', 'bin', 'acp-agent')),
      ).resolves.toBe(await realpath(executableTarget));
      await expect(
        readFile(
          join(installationHome, 'install-working-directory.txt'),
          'utf8',
        ),
      ).resolves.toBe(`${implementationDirectory}\n`);
      await expect(
        access(join(ambientHome, '.local', 'bin', 'acp-agent')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('fails when the download side of an installer pipeline fails', async () => {
    const implementation = {
      source: {
        type: 'install-command',
        command: 'false | true',
      },
      executable: 'acp-agent',
    } as const satisfies ACPImplementation;
    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), 'ai-sdk-harness-acp-install-'),
    );
    const scriptPath = join(temporaryDirectory, 'install.sh');
    await writeFile(
      scriptPath,
      getImplementationInstallScript({ implementation })!,
    );

    try {
      await expect(execFileAsync('bash', [scriptPath])).rejects.toMatchObject({
        code: 1,
      });
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
