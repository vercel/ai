import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createReadBridgeAsset } from './bridge-asset';

describe('createReadBridgeAsset', () => {
  let temporaryDirectory: string;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(
      join(tmpdir(), 'ai-sdk-harness-bridge-asset-'),
    );
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('reads multiple UTF-8 assets using the configured URL map', async () => {
    await Promise.all([
      writeFile(join(temporaryDirectory, 'first.txt'), 'first: ä'),
      writeFile(join(temporaryDirectory, 'second.txt'), 'second: 文'),
    ]);
    const directoryUrl = pathToFileURL(`${temporaryDirectory}/`);
    const readBridgeAsset = createReadBridgeAsset({
      'first.txt': new URL('first.txt', directoryUrl),
      'second.txt': new URL('second.txt', directoryUrl),
    });

    await expect(readBridgeAsset('first.txt')).resolves.toBe('first: ä');
    await expect(readBridgeAsset('second.txt')).resolves.toBe('second: 文');
  });

  it('propagates filesystem errors unchanged', async () => {
    const directoryUrl = pathToFileURL(`${temporaryDirectory}/`);
    const readBridgeAsset = createReadBridgeAsset({
      'missing.txt': new URL('missing.txt', directoryUrl),
    });

    const error = await readBridgeAsset('missing.txt').catch(error => error);

    expect(error).toMatchObject({
      code: 'ENOENT',
    });
  });
});
