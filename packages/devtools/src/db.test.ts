import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getRuns, reloadDb, type Run } from './db.js';

const ENV_KEY = 'AI_SDK_DEVTOOLS_DB_PATH';

const makeRun = (id: string): Run => ({
  id,
  started_at: new Date().toISOString(),
  parent_run_id: null,
  parent_step_id: null,
  function_id: null,
});

describe('reloadDb (VULN-11550: database path is server-configured only)', () => {
  let tmpDir: string;
  const originalEnv = process.env[ENV_KEY];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devtools-db-'));
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = originalEnv;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const writeDbFile = (name: string, db: unknown): string => {
    const filePath = path.join(tmpDir, name);
    fs.writeFileSync(filePath, JSON.stringify(db));
    return filePath;
  };

  it('reads runs from the configured database path', async () => {
    process.env[ENV_KEY] = writeDbFile('generations.json', {
      runs: [makeRun('run-1')],
      steps: [],
    });

    await reloadDb();

    expect((await getRuns()).map(r => r.id)).toEqual(['run-1']);
  });

  it('never reads a file other than the configured path', async () => {
    // A path supplied over the network previously redirected reads here.
    // `reloadDb()` now takes no path argument, so there is no way to point it
    // at this file.
    const attackerTarget = writeDbFile('attacker.json', {
      runs: [makeRun('stolen')],
      steps: [],
    });
    process.env[ENV_KEY] = writeDbFile('generations.json', {
      runs: [],
      steps: [],
    });

    await reloadDb();

    expect(await getRuns()).toEqual([]);
    // The attacker-controlled file is left entirely untouched.
    expect(fs.existsSync(attackerTarget)).toBe(true);
  });

  it('yields no runs (and does not throw) when the configured path is not a regular file', async () => {
    // A directory stands in for any non-regular file, e.g. a device file like
    // /dev/zero that would otherwise hang or OOM a synchronous read.
    process.env[ENV_KEY] = tmpDir;

    await expect(reloadDb()).resolves.toBeUndefined();
    expect(await getRuns()).toEqual([]);
  });
});
