import type * as NodeFsPromises from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import {
  createGrokBuild,
  GROK_BUILD_BUILTIN_TOOLS,
  toCommonName,
} from './grok-build-harness';

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof NodeFsPromises>();
  return {
    ...actual,
    readFile: vi.fn(async (input: unknown, ...rest: unknown[]) => {
      const p = String(input);
      if (p.endsWith('/bridge/index.mjs')) return '// mock bridge\n';
      if (p.endsWith('/bridge/package.json')) return '{"name":"mock"}';
      if (p.endsWith('/bridge/pnpm-lock.yaml')) return 'lockfileVersion: 9\n';
      return actual.readFile(input as any, ...(rest as any[]));
    }),
  };
});

describe('grok-build builtin tools', () => {
  it('exposes common tool names', () => {
    expect(Object.keys(GROK_BUILD_BUILTIN_TOOLS)).toEqual(
      expect.arrayContaining(['read', 'write', 'edit', 'bash']),
    );
  });

  it('maps a native name to its common name', () => {
    expect(toCommonName('Read')).toBe('read');
  });

  it('passes through unknown native names unchanged', () => {
    expect(toCommonName('SomeGrokSpecificTool')).toBe('SomeGrokSpecificTool');
  });
});

describe('grok-build bootstrap', () => {
  it('produces a bootstrap recipe under the adapter-owned dir', async () => {
    const harness = createGrokBuild();
    const bootstrap = await harness.getBootstrap!();
    expect(bootstrap.harnessId).toBe('grok-build');
    expect(bootstrap.bootstrapDir).toBe('/tmp/harness/grok-build');
    const paths = bootstrap.files.map(f => f.path);
    expect(paths).toContain('/tmp/harness/grok-build/package.json');
    expect(paths).toContain('/tmp/harness/grok-build/pnpm-lock.yaml');
    expect(paths).toContain('/tmp/harness/grok-build/bridge.mjs');
    expect(bootstrap.commands.some(c => c.command.includes('pnpm'))).toBe(true);
  });
});
