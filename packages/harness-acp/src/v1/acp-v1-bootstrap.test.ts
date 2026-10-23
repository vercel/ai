import { execFile } from 'node:child_process';
import * as fsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it, vi } from 'vitest';
import { createACPBootstrap, resolveACPAgentLaunch } from './acp-v1-bootstrap';

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof fsPromises>();
  return {
    ...actual,
    readFile: vi.fn(async (input: unknown, ...rest: unknown[]) => {
      const path = typeof input === 'string' ? input : String(input);
      if (path.endsWith('/bridge/index.mjs')) return '// mock bridge\n';
      if (path.endsWith('/bridge/host-tool-mcp.mjs'))
        return '// mock host tool MCP\n';
      if (path.endsWith('/bridge/package.json'))
        return '{"name":"harness-acp-bridge"}\n';
      if (path.endsWith('/bridge/pnpm-lockfile.yaml'))
        return "lockfileVersion: '9.0'\n";
      const readFile = actual.readFile as unknown as (
        ...args: unknown[]
      ) => Promise<unknown>;
      return readFile(input, ...rest);
    }),
  };
});

const execFileAsync = promisify(execFile);

const lockedSource = {
  type: 'npm-locked',
  packageJson: '{"name":"locked-acp-agent"}\n',
  pnpmLockYaml: "lockfileVersion: '9.0'\n# locked\n",
  pnpmWorkspaceYaml: "allowBuilds:\n  '@example/acp-agent': true\n",
} as const;

async function getInstallScript({
  command,
}: {
  command: string;
}): Promise<string> {
  const bootstrap = await createACPBootstrap({
    harnessId: 'example-acp',
    source: { type: 'install-command', command },
  }).getBootstrap();
  return bootstrap.files.find(file => file.path.endsWith('/install.sh'))!
    .content;
}

describe('createACPBootstrap', () => {
  it('installs a locked source as the complete bridge installation', async () => {
    vi.mocked(fsPromises.readFile).mockClear();
    const bootstrap = await createACPBootstrap({
      harnessId: 'example-acp',
      source: lockedSource,
    }).getBootstrap();

    expect(bootstrap.bootstrapDir).toBe('.harness-bootstrap/example-acp');
    expect(
      Object.fromEntries(
        bootstrap.files.map(file => [file.path, file.content]),
      ),
    ).toEqual({
      '.harness-bootstrap/example-acp/bridge.mjs': '// mock bridge\n',
      '.harness-bootstrap/example-acp/host-tool-mcp.mjs':
        '// mock host tool MCP\n',
      '.harness-bootstrap/example-acp/package.json': lockedSource.packageJson,
      '.harness-bootstrap/example-acp/pnpm-lock.yaml':
        lockedSource.pnpmLockYaml,
      '.harness-bootstrap/example-acp/pnpm-workspace.yaml':
        lockedSource.pnpmWorkspaceYaml,
    });
    expect(bootstrap.commands).toEqual([
      {
        command:
          'pnpm install --frozen-lockfile --prod --store-dir .pnpm-store',
      },
    ]);
    expect(
      vi
        .mocked(fsPromises.readFile)
        .mock.calls.map(([input]) => String(input))
        .filter(
          path =>
            path.endsWith('/bridge/package.json') ||
            path.endsWith('/bridge/pnpm-lockfile.yaml'),
        ),
    ).toEqual([]);
  });

  it('installs the bridge manifest before running an install command', async () => {
    vi.mocked(fsPromises.readFile).mockClear();
    const bootstrap = await createACPBootstrap({
      harnessId: 'cursor-acp',
      source: {
        type: 'install-command',
        command: 'curl https://cursor.com/install -fsS | bash',
      },
    }).getBootstrap();

    expect(bootstrap.files.map(file => file.path).sort()).toEqual([
      '.harness-bootstrap/cursor-acp/bridge.mjs',
      '.harness-bootstrap/cursor-acp/host-tool-mcp.mjs',
      '.harness-bootstrap/cursor-acp/install.sh',
      '.harness-bootstrap/cursor-acp/package.json',
      '.harness-bootstrap/cursor-acp/pnpm-lock.yaml',
    ]);
    expect(
      bootstrap.files.find(file => file.path.endsWith('/package.json'))
        ?.content,
    ).toBe('{"name":"harness-acp-bridge"}\n');
    expect(
      bootstrap.files.find(file => file.path.endsWith('/pnpm-lock.yaml'))
        ?.content,
    ).toBe("lockfileVersion: '9.0'\n");
    expect(
      vi
        .mocked(fsPromises.readFile)
        .mock.calls.some(([input]) =>
          String(input).endsWith('/bridge/pnpm-lockfile.yaml'),
        ),
    ).toBe(true);
    expect(
      bootstrap.files.find(file => file.path.endsWith('/install.sh'))?.content,
    ).toContain('curl https://cursor.com/install -fsS | bash');
    expect(bootstrap.commands).toEqual([
      {
        command:
          'pnpm install --frozen-lockfile --prod --store-dir .pnpm-store',
      },
      { command: 'bash install.sh' },
    ]);
  });

  it('caches the bootstrap', async () => {
    const { getBootstrap } = createACPBootstrap({
      harnessId: 'example-acp',
      source: lockedSource,
    });

    expect(await getBootstrap()).toBe(await getBootstrap());
  });

  it('installs into a private home below the bootstrap directory', async () => {
    const temporaryDirectory = await fsPromises.mkdtemp(
      join(tmpdir(), 'ai-sdk-harness-acp-install-'),
    );
    const bootstrapDirectory = join(
      temporaryDirectory,
      '.harness-bootstrap',
      'example-acp',
    );
    const ambientHome = join(temporaryDirectory, 'ambient-home');
    const scriptPath = join(bootstrapDirectory, 'install.sh');
    await fsPromises.mkdir(bootstrapDirectory, { recursive: true });
    await fsPromises.mkdir(ambientHome, { recursive: true });
    await fsPromises.writeFile(
      scriptPath,
      await getInstallScript({
        command: [
          'mkdir -p "$HOME/.local/share/acp-agent"',
          `printf '#!/usr/bin/env bash\\nexit 0\\n' > "$HOME/.local/share/acp-agent/acp-agent"`,
          'chmod +x "$HOME/.local/share/acp-agent/acp-agent"',
          'ln -s "$HOME/.local/share/acp-agent/acp-agent" "$HOME/.local/bin/acp-agent"',
          'pwd > "$HOME/install-working-directory.txt"',
        ].join('\n'),
      }),
    );

    try {
      await execFileAsync('bash', [scriptPath], {
        env: { ...process.env, HOME: ambientHome },
      });

      const installationHome = join(bootstrapDirectory, 'home');
      await expect(
        fsPromises.realpath(
          join(installationHome, '.local', 'bin', 'acp-agent'),
        ),
      ).resolves.toBe(
        await fsPromises.realpath(
          join(installationHome, '.local', 'share', 'acp-agent', 'acp-agent'),
        ),
      );
      await expect(
        fsPromises.readFile(
          join(installationHome, 'install-working-directory.txt'),
          'utf8',
        ),
      ).resolves.toBe(`${installationHome}\n`);
      await expect(
        fsPromises.access(join(ambientHome, '.local', 'bin', 'acp-agent')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await fsPromises.rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('fails when the download side of an installer pipeline fails', async () => {
    const temporaryDirectory = await fsPromises.mkdtemp(
      join(tmpdir(), 'ai-sdk-harness-acp-install-'),
    );
    const scriptPath = join(temporaryDirectory, 'install.sh');
    await fsPromises.writeFile(
      scriptPath,
      await getInstallScript({ command: 'false | true' }),
    );

    try {
      await expect(execFileAsync('bash', [scriptPath])).rejects.toMatchObject({
        code: 1,
      });
    } finally {
      await fsPromises.rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
});

describe('resolveACPAgentLaunch', () => {
  it('launches a locked agent from the bridge installation', () => {
    expect(
      resolveACPAgentLaunch({
        bootstrapDirectory: '/home/agent/.harness-bootstrap/example-acp',
        source: lockedSource,
        executable: 'acp-agent',
        args: ['stdio'],
      }),
    ).toEqual({
      command:
        '/home/agent/.harness-bootstrap/example-acp/node_modules/.bin/acp-agent',
      args: ['stdio'],
    });
  });

  it('launches an installed agent with its private home', () => {
    expect(
      resolveACPAgentLaunch({
        bootstrapDirectory: '/home/agent/.harness-bootstrap/cursor-acp',
        source: { type: 'install-command', command: 'install' },
        executable: 'agent',
      }),
    ).toEqual({
      command:
        '/home/agent/.harness-bootstrap/cursor-acp/home/.local/bin/agent',
      args: [],
      home: '/home/agent/.harness-bootstrap/cursor-acp/home',
    });
  });
});
