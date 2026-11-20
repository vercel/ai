import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DbModule from './db.js';

const originalCwd = process.cwd();
let tempDirs: string[] = [];

const writeDb = (dbPath: string, runs: Array<Record<string, unknown>>) => {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, JSON.stringify({ runs, steps: [] }));
};

describe('devtools db', () => {
  let db: typeof DbModule;
  let tempDir: string;

  // Keep cold module transformation out of the test timeout on busy CI runners.
  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdk-devtools-'));
    tempDirs.push(tempDir);
    process.chdir(tempDir);
    vi.resetModules();
    db = await import('./db.js');
  }, 30_000);

  afterEach(() => {
    process.chdir(originalCwd);
    vi.resetModules();

    for (const tempDir of tempDirs) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    tempDirs = [];
  });

  describe.skipIf(process.platform === 'win32')('storage permissions', () => {
    it.each(['directory symlink', 'database symlink', 'database hard link'])(
      'rejects a %s without modifying its target',
      async kind => {
        const targetDir = fs.mkdtempSync(
          path.join(os.tmpdir(), 'devtools-target-'),
        );
        tempDirs.push(targetDir);
        fs.chmodSync(targetDir, 0o755);
        const targetFile = path.join(targetDir, 'generations.json');
        const originalMode = kind === 'database hard link' ? 0o600 : 0o400;
        fs.writeFileSync(targetFile, 'unrelated content');
        fs.chmodSync(targetFile, originalMode);
        const dbDir = path.join(tempDir, '.devtools');

        if (kind === 'directory symlink') {
          fs.symlinkSync(targetDir, dbDir);
        } else {
          fs.mkdirSync(dbDir);
          const link =
            kind === 'database hard link' ? fs.linkSync : fs.symlinkSync;
          link(targetFile, path.join(dbDir, 'generations.json'));
        }

        await expect(db.clearDatabase()).rejects.toThrow();

        expect(fs.statSync(targetDir).mode & 0o777).toBe(0o755);
        expect(fs.statSync(targetFile).mode & 0o777).toBe(originalMode);
        expect(fs.readFileSync(targetFile, 'utf8')).toBe('unrelated content');
      },
    );

    it('rejects a workspace writable by other accounts before creating storage', async () => {
      fs.chmodSync(tempDir, 0o777);

      await expect(db.clearDatabase()).rejects.toThrow();

      expect(fs.existsSync(path.join(tempDir, '.devtools'))).toBe(false);
    });

    it.each(['new', 'existing'])(
      'restricts %s storage to owner-only permissions',
      async storage => {
        const dbDir = path.join(tempDir, '.devtools');
        const dbPath = path.join(dbDir, 'generations.json');
        const originalUmask = process.umask(0o022);
        try {
          if (storage === 'existing') writeDb(dbPath, []);

          await db.createRun('run-1');

          expect(fs.statSync(dbDir).mode & 0o777).toBe(0o700);
          expect(fs.statSync(dbPath).mode & 0o777).toBe(0o600);
        } finally {
          process.umask(originalUmask);
        }
      },
    );
  });

  it('accepts real .devtools/generations.json files', () => {
    const dbPath = path.join(tempDir, 'app', '.devtools', 'generations.json');

    writeDb(dbPath, []);

    expect(db.validateRemoteDbPath(dbPath)).toBe(fs.realpathSync(dbPath));
  });

  it('rejects paths outside .devtools/generations.json', () => {
    const dbPath = path.join(tempDir, 'app', 'generations.json');

    writeDb(dbPath, []);

    expect(db.validateRemoteDbPath(dbPath)).toBeUndefined();
    expect(db.validateRemoteDbPath(null)).toBeUndefined();
  });

  it('reloads a validated remote devtools database', async () => {
    const run = {
      id: 'run-1',
      started_at: '2026-06-11T00:00:00.000Z',
      parent_run_id: null,
      parent_step_id: null,
      function_id: null,
    };
    const dbPath = path.join(tempDir, 'app', '.devtools', 'generations.json');

    writeDb(dbPath, [run]);
    await db.reloadDb(dbPath);

    await expect(db.getRuns()).resolves.toEqual([run]);
  });

  it('does not reload arbitrary JSON files', async () => {
    const run = {
      id: 'run-1',
      started_at: '2026-06-11T00:00:00.000Z',
      parent_run_id: null,
      parent_step_id: null,
      function_id: null,
    };
    const dbPath = path.join(tempDir, 'app', 'generations.json');

    writeDb(dbPath, [run]);
    await db.reloadDb(dbPath);

    await expect(db.getRuns()).resolves.toEqual([]);
  });

  it('rejects symlinked devtools databases that resolve outside devtools', async () => {
    const dbPath = path.join(tempDir, 'app', '.devtools', 'generations.json');
    const targetPath = path.join(tempDir, 'target.json');

    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    writeDb(targetPath, []);
    fs.symlinkSync(targetPath, dbPath);

    expect(db.validateRemoteDbPath(dbPath)).toBeUndefined();
    await db.reloadDb(dbPath);

    await expect(db.getRuns()).resolves.toEqual([]);
  });

  it('rejects devtools databases larger than the size cap', async () => {
    const dbPath = path.join(tempDir, 'app', '.devtools', 'generations.json');

    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    // Sparse file just over the 100 MB cap — reports a large size without
    // consuming disk, standing in for a huge / OOM-inducing database.
    fs.writeFileSync(dbPath, '');
    fs.truncateSync(dbPath, 100 * 1024 * 1024 + 1);

    expect(db.validateRemoteDbPath(dbPath)).toBeUndefined();
    await db.reloadDb(dbPath);

    await expect(db.getRuns()).resolves.toEqual([]);
  });
});
