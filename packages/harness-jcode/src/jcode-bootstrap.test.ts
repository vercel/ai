import { readFile } from 'node:fs/promises';
import type * as FsPromises from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof FsPromises>();
  return {
    ...actual,
    readFile: vi.fn(async (path: unknown) => `asset:${String(path)}`),
  };
});

describe('getJcodeBootstrap', () => {
  it('declares deterministic bridge assets and install verification', async () => {
    const { getJcodeBootstrap, JCODE_BOOTSTRAP_DIR } =
      await import('./jcode-bootstrap');
    const first = await getJcodeBootstrap();
    const second = await getJcodeBootstrap();

    expect(second).toBe(first);
    expect(first).toMatchObject({
      harnessId: 'jcode',
      bootstrapDir: JCODE_BOOTSTRAP_DIR,
    });
    expect(first.files.map(file => file.path)).toEqual([
      `${JCODE_BOOTSTRAP_DIR}/package.json`,
      `${JCODE_BOOTSTRAP_DIR}/pnpm-lock.yaml`,
      `${JCODE_BOOTSTRAP_DIR}/pnpm-workspace.yaml`,
      `${JCODE_BOOTSTRAP_DIR}/bridge.mjs`,
    ]);
    expect(first.commands[0]?.command).toContain(
      'pnpm install --frozen-lockfile',
    );
    expect(first.commands[1]?.command).toContain('@1jehuang/jcode-sdk');
    expect(readFile).toHaveBeenCalledTimes(4);
  });
});
