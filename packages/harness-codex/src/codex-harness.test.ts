import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1NetworkSandboxSession,
} from '@ai-sdk/harness';
import type * as NodeFsPromises from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { createCodex } from './codex-harness';

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof NodeFsPromises>();
  return {
    ...actual,
    readFile: vi.fn(async (input: unknown, ...rest: unknown[]) => {
      const path = typeof input === 'string' ? input : String(input);
      if (path.endsWith('/bridge/index.mjs')) return '// mock bridge\n';
      if (path.endsWith('/bridge/host-tool-mcp.mjs'))
        return '// mock host-tool-mcp\n';
      if (path.endsWith('/bridge/package.json')) return '{"name":"mock"}';
      if (path.endsWith('/bridge/pnpm-lock.yaml'))
        return 'lockfileVersion: "9.0"\n';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (actual.readFile as any)(input, ...rest);
    }),
  };
});

describe('createCodex adapter', () => {
  it('declares the harness id and builtin tools', () => {
    const harness = createCodex();
    expect(harness.harnessId).toBe('codex');
    expect(harness.specificationVersion).toBe('harness-v1');
    expect(harness.supportsBuiltinToolApprovals).toBe(false);
    expect(Object.keys(harness.builtinTools)).toEqual(['bash', 'webSearch']);
    expect(harness.builtinTools.bash.nativeName).toBe('shell');
    expect(harness.builtinTools.bash.commonName).toBe('bash');
    expect(harness.builtinTools.webSearch.nativeName).toBe('web_search');
    expect(harness.builtinTools.webSearch.commonName).toBe('webSearch');
  });

  it('rejects built-in permission modes other than allow-all', async () => {
    const harness = createCodex();
    await expect(
      harness.doStart({
        sessionId: 's1',
        sandboxSession: {} as HarnessV1NetworkSandboxSession,
        sessionWorkDir: '/vercel/sandbox/codex-s1',
        permissionMode: 'allow-edits',
      }),
    ).rejects.toBeInstanceOf(HarnessCapabilityUnsupportedError);
  });

  it('throws HarnessCapabilityUnsupportedError when the network sandbox session exposes no ports', async () => {
    const harness = createCodex();
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
        sessionWorkDir: '/vercel/sandbox/codex-s1',
      }),
    ).rejects.toBeInstanceOf(HarnessCapabilityUnsupportedError);
  });

  describe('getBootstrap', () => {
    it('returns a recipe with the expected harnessId and bootstrapDir', async () => {
      const harness = createCodex();
      expect(harness.getBootstrap).toBeDefined();
      const recipe = await harness.getBootstrap!();
      expect(recipe.harnessId).toBe('codex');
      expect(recipe.bootstrapDir).toBe('/tmp/harness/codex');
    });

    it('includes bridge.mjs, host-tool-mcp.mjs, package.json, and pnpm-lock.yaml under the bootstrap dir', async () => {
      const harness = createCodex();
      const recipe = await harness.getBootstrap!();
      const paths = recipe.files.map(f => f.path).sort();
      expect(paths).toEqual([
        '/tmp/harness/codex/bridge.mjs',
        '/tmp/harness/codex/host-tool-mcp.mjs',
        '/tmp/harness/codex/package.json',
        '/tmp/harness/codex/pnpm-lock.yaml',
      ]);
      for (const file of recipe.files) {
        expect(file.content.length).toBeGreaterThan(0);
      }
    });

    it('declares mkdir and pnpm install commands', async () => {
      const harness = createCodex();
      const recipe = await harness.getBootstrap!();
      const commands = recipe.commands.map(c => c.command);
      expect(commands[0]).toContain('mkdir -p /tmp/harness/codex');
      expect(commands[1]).toContain('pnpm');
      expect(commands[1]).toContain('install --frozen-lockfile');
    });

    it('caches the recipe across calls', async () => {
      const harness = createCodex();
      const a = await harness.getBootstrap!();
      const b = await harness.getBootstrap!();
      expect(a).toBe(b);
    });
  });
});
