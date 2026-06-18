import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1NetworkSandboxSession,
} from '@ai-sdk/harness';
import type * as HarnessUtils from '@ai-sdk/harness/utils';
import type * as NodeFsPromises from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { createOpenCode } from './opencode-harness';

vi.mock('@ai-sdk/harness/utils', async importOriginal => {
  const actual = await importOriginal<typeof HarnessUtils>();
  return {
    ...actual,
    markBridgeStarting: vi.fn(),
    waitForBridgeReady: vi.fn(async () => {
      throw new Error('stop after spawn');
    }),
  };
});

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof NodeFsPromises>();
  return {
    ...actual,
    readFile: vi.fn(async (...args: Parameters<typeof actual.readFile>) => {
      const [input] = args;
      const filePath = typeof input === 'string' ? input : String(input);
      if (filePath.endsWith('/bridge/index.mjs')) return '// mock bridge\n';
      if (filePath.endsWith('/bridge/host-tool-mcp.mjs'))
        return '// mock host-tool-mcp\n';
      if (filePath.endsWith('/bridge/package.json')) return '{"name":"mock"}';
      if (filePath.endsWith('/bridge/pnpm-lock.yaml'))
        return 'lockfileVersion: "9.0"\n';
      return actual.readFile(...args);
    }),
  };
});

function getBuiltinToolMetadata(tool: unknown): {
  nativeName?: string;
  commonName?: string;
} {
  return tool as { nativeName?: string; commonName?: string };
}

describe('createOpenCode adapter', () => {
  it('declares the harness id and builtin tools', () => {
    const harness = createOpenCode();
    expect(harness.harnessId).toBe('opencode');
    expect(harness.specificationVersion).toBe('harness-v1');
    expect(harness.supportsBuiltinToolApprovals).toBe(true);
    expect(Object.keys(harness.builtinTools)).toEqual([
      'read',
      'write',
      'edit',
      'bash',
      'glob',
      'grep',
      'ls',
      'webfetch',
      'agent',
    ]);
    expect(getBuiltinToolMetadata(harness.builtinTools.read).nativeName).toBe(
      'view',
    );
    expect(getBuiltinToolMetadata(harness.builtinTools.read).commonName).toBe(
      'read',
    );
    expect(
      getBuiltinToolMetadata(harness.builtinTools.agent).nativeName,
    ).toBeUndefined();
  });

  it('throws HarnessCapabilityUnsupportedError when the network sandbox session exposes no ports', async () => {
    const harness = createOpenCode();
    const sandboxSession = {
      id: 'test-sandbox',
      defaultWorkingDirectory: '/vercel/sandbox',
      restricted: () => ({}) as never,
      ports: [] as ReadonlyArray<number>,
      async getPortUrl() {
        return '';
      },
      async stop() {},
    } as unknown as HarnessV1NetworkSandboxSession;
    await expect(
      harness.doStart({
        sessionId: 's1',
        sandboxSession,
        sessionWorkDir: '/vercel/sandbox/opencode-s1',
      }),
    ).rejects.toBeInstanceOf(HarnessCapabilityUnsupportedError);
  });

  it('writes skills under sandbox HOME and starts OpenCode with that HOME', async () => {
    const runCommands: string[] = [];
    const writes: Array<{ path: string; content: string }> = [];
    const spawns: Array<{
      command: string;
      env: Record<string, string | undefined>;
    }> = [];
    const sandbox = {
      async run({ command }: { command: string }) {
        runCommands.push(command);
        if (command === 'printf "%s" "$HOME"') {
          return {
            exitCode: 0,
            stdout: '/home/vercel-sandbox',
            stderr: '',
          };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      },
      async writeTextFile({
        path,
        content,
      }: {
        path: string;
        content: string;
      }) {
        writes.push({ path, content });
      },
      async readTextFile() {
        return '';
      },
      async spawn({
        command,
        env,
      }: {
        command: string;
        env: Record<string, string | undefined>;
      }) {
        spawns.push({ command, env });
        return {} as never;
      },
    };
    const sandboxSession = {
      id: 'test-sandbox',
      defaultWorkingDirectory: '/workspace',
      restricted: () => sandbox,
      ports: [4000] as ReadonlyArray<number>,
      async getPortUrl() {
        return 'ws://sandbox.example';
      },
      async stop() {},
    } as unknown as HarnessV1NetworkSandboxSession;

    await expect(
      createOpenCode().doStart({
        sessionId: 's1',
        sandboxSession,
        sessionWorkDir: '/workspace/project',
        skills: [
          {
            name: 'demo',
            description: 'Demo skill.',
            content: 'Use reference.md.',
            files: [{ path: 'reference.md', content: '# Reference' }],
          },
        ],
      }),
    ).rejects.toThrow('stop after spawn');

    expect(runCommands).toContain('printf "%s" "$HOME"');
    expect(runCommands).toContain(
      "mkdir -p '/home/vercel-sandbox/.agents/skills'",
    );
    expect(writes).toEqual([
      {
        path: '/home/vercel-sandbox/.agents/skills/demo/SKILL.md',
        content:
          '---\nname: demo\ndescription: Demo skill.\n---\n\nUse reference.md.',
      },
      {
        path: '/home/vercel-sandbox/.agents/skills/demo/reference.md',
        content: '# Reference',
      },
    ]);
    expect(writes.some(write => write.path.includes('/.opencode/'))).toBe(
      false,
    );
    expect(
      writes.some(write => write.path.startsWith('/workspace/project/')),
    ).toBe(false);
    expect(spawns.at(-1)?.env.HOME).toBe('/home/vercel-sandbox');
    expect(spawns.at(-1)?.env.USERPROFILE).toBe('/home/vercel-sandbox');
    expect(spawns.at(-1)?.env.XDG_CONFIG_HOME).toBe(
      '/home/vercel-sandbox/.config',
    );
    expect(spawns.at(-1)?.command).toContain(
      "--skills-dir '/home/vercel-sandbox/.agents/skills'",
    );
  });

  describe('getBootstrap', () => {
    it('returns a recipe with the expected harnessId and bootstrapDir', async () => {
      const harness = createOpenCode();
      expect(harness.getBootstrap).toBeDefined();
      const recipe = await harness.getBootstrap!();
      expect(recipe.harnessId).toBe('opencode');
      expect(recipe.bootstrapDir).toBe('/tmp/harness/opencode');
    });

    it('includes bridge assets under the bootstrap dir', async () => {
      const harness = createOpenCode();
      const recipe = await harness.getBootstrap!();
      const paths = recipe.files.map(file => file.path).sort();
      expect(paths).toEqual([
        '/tmp/harness/opencode/bridge.mjs',
        '/tmp/harness/opencode/host-tool-mcp.mjs',
        '/tmp/harness/opencode/package.json',
        '/tmp/harness/opencode/pnpm-lock.yaml',
      ]);
      for (const file of recipe.files) {
        expect(file.content.length).toBeGreaterThan(0);
      }
    });

    it('runs the OpenCode CLI postinstall during bootstrap', async () => {
      const harness = createOpenCode();
      const recipe = await harness.getBootstrap!();
      expect(recipe.commands).toContainEqual({
        command:
          'cd /tmp/harness/opencode && node node_modules/opencode-ai/postinstall.mjs && ./node_modules/.bin/opencode --version',
      });
    });
  });
});
