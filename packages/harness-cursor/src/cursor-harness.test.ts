import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1NetworkSandboxSession,
} from '@ai-sdk/harness';
import type * as NodeFsPromises from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { createCursor } from './cursor-harness';

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

describe('createCursor adapter', () => {
  it('declares the harness id and builtin tools', () => {
    const harness = createCursor();
    expect(harness.harnessId).toBe('cursor');
    expect(harness.specificationVersion).toBe('harness-v1');
    expect(harness.supportsBuiltinToolApprovals).toBe(false);
    expect(Object.keys(harness.builtinTools)).toEqual([
      'read',
      'write',
      'edit',
      'bash',
      'grep',
      'glob',
      'ls',
      'semSearch',
    ]);
    expect(harness.builtinTools.bash.nativeName).toBe('shell');
    expect(harness.builtinTools.bash.commonName).toBe('bash');
  });

  it('throws HarnessCapabilityUnsupportedError when the network sandbox session exposes no ports', async () => {
    const harness = createCursor();
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
        sessionWorkDir: '/vercel/sandbox/cursor-s1',
      }),
    ).rejects.toBeInstanceOf(HarnessCapabilityUnsupportedError);
  });

  describe('getBootstrap', () => {
    it('returns a recipe with the expected harnessId and bootstrapDir', async () => {
      const harness = createCursor();
      expect(harness.getBootstrap).toBeDefined();
      const recipe = await harness.getBootstrap!();
      expect(recipe.harnessId).toBe('cursor');
      expect(recipe.bootstrapDir).toBe('/tmp/harness/cursor');
    });

    it('caches the bootstrap recipe', async () => {
      const harness = createCursor();
      const first = await harness.getBootstrap!();
      const second = await harness.getBootstrap!();
      expect(first).toBe(second);
    });

    it('ships bridge assets in the recipe', async () => {
      const harness = createCursor();
      const recipe = await harness.getBootstrap!();
      const paths = recipe.files.map(f => f.path);
      expect(paths).toContain('/tmp/harness/cursor/bridge.mjs');
      expect(paths).toContain('/tmp/harness/cursor/package.json');
      expect(paths).toContain('/tmp/harness/cursor/pnpm-lock.yaml');
    });
  });
});
