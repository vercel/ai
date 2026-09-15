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

  it('reads multiple UTF-8 assets using the configured URL resolver', async () => {
    await Promise.all([
      writeFile(join(temporaryDirectory, 'first.txt'), 'first: ä'),
      writeFile(join(temporaryDirectory, 'second.txt'), 'second: 文'),
    ]);
    const resolvedNames: string[] = [];
    const directoryUrl = pathToFileURL(`${temporaryDirectory}/`);
    const readBridgeAsset = createReadBridgeAsset({
      resolveAssetUrl: name => {
        resolvedNames.push(name);
        return new URL(name, directoryUrl);
      },
    });

    await expect(readBridgeAsset('first.txt')).resolves.toBe('first: ä');
    await expect(readBridgeAsset('second.txt')).resolves.toBe('second: 文');
    expect(resolvedNames).toEqual(['first.txt', 'second.txt']);
  });

  it('propagates filesystem errors unchanged', async () => {
    const directoryUrl = pathToFileURL(`${temporaryDirectory}/`);
    const readBridgeAsset = createReadBridgeAsset({
      resolveAssetUrl: name => new URL(name, directoryUrl),
    });

    const error = await readBridgeAsset('missing.txt').catch(error => error);

    expect(error).toMatchObject({
      code: 'ENOENT',
    });
  });

  it('propagates resolver errors unchanged', async () => {
    const resolverError = new Error('failed to resolve');
    const readBridgeAsset = createReadBridgeAsset({
      resolveAssetUrl: () => {
        throw resolverError;
      },
    });

    await expect(readBridgeAsset('asset.txt')).rejects.toBe(resolverError);
  });
});
