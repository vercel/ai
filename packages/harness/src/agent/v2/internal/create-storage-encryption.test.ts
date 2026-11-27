import { decrypt, encrypt, importKey } from '@workflow/core/encryption';
import type { World } from '@workflow/world';
import { describe, expect, test, vi } from 'vitest';
import { InMemoryWorld } from '../in-memory-world';
import { createStorageEncryption } from './create-storage-encryption';
import { HarnessStorageEncryptionError } from './errors';

const data = new TextEncoder().encode('secret credentials');
const rawKey = new Uint8Array(32).fill(7);

describe('createStorageEncryption', () => {
  test('resolves and imports the run key once and interoperates with Workflow', async () => {
    const world: World = new InMemoryWorld();
    const resolveKey = vi.fn(async () => rawKey);
    world.getEncryptionKeyForRun = resolveKey;
    const storage = await createStorageEncryption({
      world,
      runId: 'run',
      deploymentId: 'original',
    });
    const first = await storage.encrypt({ data });
    const second = await storage.encrypt({ data });
    expect(first).not.toEqual(data);
    expect(second).not.toEqual(first);
    expect(first.byteLength).toBe(data.byteLength + 12 + 16);
    expect(await storage.decrypt({ data: first })).toEqual(data);
    const key = await importKey(rawKey);
    expect(await decrypt(key, first)).toEqual(data);
    expect(await storage.decrypt({ data: await encrypt(key, data) })).toEqual(
      data,
    );
    expect(resolveKey).toHaveBeenCalledExactlyOnceWith('run', {
      deploymentId: 'original',
    });
  });

  test.each(['absent', 'undefined'] as const)(
    'preserves plaintext with an %s key provider',
    async mode => {
      const world: World = new InMemoryWorld();
      if (mode === 'absent') world.getEncryptionKeyForRun = undefined;
      const storage = await createStorageEncryption({
        world,
        runId: 'run',
        deploymentId: 'test',
      });
      expect(await storage.encrypt({ data })).toEqual(data);
      expect(await storage.decrypt({ data })).toEqual(data);
    },
  );

  test.each([0, 16, 31, 33])(
    'rejects a %i-byte key without disabling encryption',
    async size => {
      const world: World = new InMemoryWorld();
      world.getEncryptionKeyForRun = async () => new Uint8Array(size);
      await expect(
        createStorageEncryption({ world, runId: 'run', deploymentId: 'test' }),
      ).rejects.toMatchObject({
        name: 'AI_HarnessStorageEncryptionError',
        operation: 'resolve-key',
      });
    },
  );

  test('preserves the cause of key retrieval failure', async () => {
    const cause = new Error('key service unavailable');
    const world: World = new InMemoryWorld();
    world.getEncryptionKeyForRun = async () => {
      throw cause;
    };
    const failure = await createStorageEncryption({
      world,
      runId: 'run',
      deploymentId: 'test',
    }).catch(error => error);
    expect(HarnessStorageEncryptionError.isInstance(failure)).toBe(true);
    expect(failure.cause).toBe(cause);
    expect(failure.operation).toBe('resolve-key');
  });

  test('rejects tampering, truncation, and wrong keys without plaintext fallback', async () => {
    const world: World = new InMemoryWorld();
    world.getEncryptionKeyForRun = async () => rawKey;
    const storage = await createStorageEncryption({
      world,
      runId: 'run',
      deploymentId: 'test',
    });
    const ciphertext = await storage.encrypt({ data });
    const tampered = ciphertext.slice();
    tampered[tampered.length - 1] ^= 1;
    world.getEncryptionKeyForRun = async () => new Uint8Array(32).fill(9);
    const other = await createStorageEncryption({
      world,
      runId: 'run',
      deploymentId: 'test',
    });
    for (const invalid of [tampered, ciphertext.slice(0, 10), data]) {
      await expect(storage.decrypt({ data: invalid })).rejects.toMatchObject({
        operation: 'decrypt',
      });
    }
    await expect(other.decrypt({ data: ciphertext })).rejects.toMatchObject({
      operation: 'decrypt',
    });
  });

  test('propagates encryption failures', async () => {
    const world: World = new InMemoryWorld();
    world.getEncryptionKeyForRun = async () => rawKey;
    const storage = await createStorageEncryption({
      world,
      runId: 'run',
      deploymentId: 'test',
    });
    const spy = vi
      .spyOn(globalThis.crypto.subtle, 'encrypt')
      .mockRejectedValueOnce(new Error('crypto unavailable'));
    try {
      await expect(storage.encrypt({ data })).rejects.toMatchObject({
        operation: 'encrypt',
      });
    } finally {
      spy.mockRestore();
    }
  });
});
