import { execFile } from 'node:child_process';
import { cp, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { INLINE_RUN_WORKER_SOURCE } from '../../dist/runtime/worker-source.js';

const execFileAsync = promisify(execFile);

describe('bundled runtime', () => {
  it('embeds QuickJS and contains no runtime package resolution', () => {
    expect(INLINE_RUN_WORKER_SOURCE).toContain('__RUN_QUICKJS_WASM_BASE64__');
    expect(INLINE_RUN_WORKER_SOURCE).not.toMatch(/\brequire\(|\bimport\(/u);
    expect(INLINE_RUN_WORKER_SOURCE).not.toContain('quickjs-emscripten"');
    expect(INLINE_RUN_WORKER_SOURCE).not.toContain('node_modules/.pnpm');
  });

  it('runs from a copied dist directory without node_modules', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'run-package-'));
    try {
      await cp(
        new URL('../../dist', import.meta.url),
        join(directory, 'dist'),
        {
          recursive: true,
        },
      );
      await writeFile(
        join(directory, 'package.json'),
        JSON.stringify({ type: 'module' }),
      );
      const script = join(directory, 'run.mjs');
      await writeFile(
        script,
        `
        import { run } from './dist/index.js';
        const result = await run({ source: 'return 42;' });
        process.stdout.write(JSON.stringify(result));
      `,
      );

      const { stdout } = await execFileAsync(process.execPath, [script]);
      expect(stdout).toBe('{"status":"completed","value":42}');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('does not export internal runtime asset subpaths', async () => {
    const script = join(process.cwd(), `.tmp-run-subpaths-${Date.now()}.mjs`);
    await writeFile(
      script,
      `
        for (const specifier of ['run/worker', 'run/quickjs-wasm', 'run/runtime/worker-source']) {
          try {
            import.meta.resolve(specifier);
            throw new Error('Expected resolution to fail: ' + specifier);
          } catch (error) {
            if (error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error;
          }
        }
      `,
    );
    try {
      await expect(
        execFileAsync(process.execPath, [script]),
      ).resolves.toBeDefined();
    } finally {
      await unlink(script).catch(() => {});
    }
  });

  it('runs the inline worker without a filesystem WASM path', async () => {
    expect(INLINE_RUN_WORKER_SOURCE).not.toContain('readFileSync');
    await expect(
      execFileAsync(process.execPath, [
        '-e',
        `import('run').then(async ({ run }) => {
          const result = await run({ source: 'return { ok: true };' });
          if (JSON.stringify(result) !== '{"status":"completed","value":{"ok":true}}') process.exit(1);
        })`,
      ]),
    ).resolves.toBeDefined();
  });
});
