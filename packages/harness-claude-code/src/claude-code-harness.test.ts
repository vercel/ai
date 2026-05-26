import { HarnessCapabilityUnsupportedError } from '@ai-sdk/harness';
import type * as NodeFsPromises from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { createClaudeCode } from './claude-code-harness';

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof NodeFsPromises>();
  return {
    ...actual,
    readFile: vi.fn(async (input: unknown, ...rest: unknown[]) => {
      const path = typeof input === 'string' ? input : String(input);
      if (path.endsWith('/bridge/index.mjs')) return '// mock bridge\n';
      if (path.endsWith('/bridge/package.json')) return '{"name":"mock"}';
      if (path.endsWith('/bridge/pnpm-lock.yaml'))
        return 'lockfileVersion: "9.0"\n';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (actual.readFile as any)(input, ...rest);
    }),
  };
});

describe('createClaudeCode adapter', () => {
  it('declares the harness id and builtin tools', () => {
    const harness = createClaudeCode();
    expect(harness.harnessId).toBe('claude-code');
    expect(harness.specificationVersion).toBe('harness-v1');
    expect(harness.builtinTools.map(t => t.nativeName)).toEqual([
      'Read',
      'Write',
      'Edit',
      'Bash',
      'Glob',
      'Grep',
    ]);
  });

  it('throws HarnessCapabilityUnsupportedError when no sandbox handle is provided', async () => {
    const harness = createClaudeCode();
    await expect(harness.doStart({ sessionId: 's1' })).rejects.toBeInstanceOf(
      HarnessCapabilityUnsupportedError,
    );
  });

  it('throws HarnessCapabilityUnsupportedError when the handle exposes no ports', async () => {
    const harness = createClaudeCode();
    const sandboxHandle = {
      session: {} as never,
      ports: [] as ReadonlyArray<number>,
      async getPortUrl() {
        return '';
      },
      async stop() {},
    };
    await expect(
      harness.doStart({ sessionId: 's1', sandboxHandle }),
    ).rejects.toBeInstanceOf(HarnessCapabilityUnsupportedError);
  });

  describe('getBootstrap', () => {
    it('returns a recipe with the expected harnessId and bootstrapDir', async () => {
      const harness = createClaudeCode();
      expect(harness.getBootstrap).toBeDefined();
      const recipe = await harness.getBootstrap!();
      expect(recipe.harnessId).toBe('claude-code');
      expect(recipe.bootstrapDir).toBe('/tmp/harness/claude-code');
    });

    it('includes bridge.mjs, package.json, and pnpm-lock.yaml under the bootstrap dir', async () => {
      const harness = createClaudeCode();
      const recipe = await harness.getBootstrap!();
      const paths = recipe.files.map(f => f.path).sort();
      expect(paths).toEqual([
        '/tmp/harness/claude-code/bridge.mjs',
        '/tmp/harness/claude-code/package.json',
        '/tmp/harness/claude-code/pnpm-lock.yaml',
      ]);
      for (const file of recipe.files) {
        expect(file.content.length).toBeGreaterThan(0);
      }
    });

    it('declares mkdir, pnpm install, and claude post-install commands', async () => {
      const harness = createClaudeCode();
      const recipe = await harness.getBootstrap!();
      const commands = recipe.commands.map(c => c.command);
      expect(commands[0]).toContain('mkdir -p /tmp/harness/claude-code');
      expect(commands[1]).toContain('pnpm');
      expect(commands[1]).toContain('install --frozen-lockfile');
      expect(commands[2]).toContain('claude --version');
    });

    it('caches the recipe across calls', async () => {
      const harness = createClaudeCode();
      const a = await harness.getBootstrap!();
      const b = await harness.getBootstrap!();
      expect(a).toBe(b);
    });
  });
});
