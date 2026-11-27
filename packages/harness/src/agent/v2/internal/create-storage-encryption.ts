import {
  decrypt,
  encrypt,
  importKey,
  type CryptoKey,
} from '@workflow/core/encryption';
import type { World } from '@workflow/world';
import { HarnessStorageEncryptionError } from './errors';

/**
 * Protects serialized payload bytes independently of their JSON envelopes.
 * Only the engine holds this capability; adapters work with decoded values.
 */
export type HarnessAgentStorageEncryption = {
  encrypt(options: { data: Uint8Array }): Promise<Uint8Array>;
  decrypt(options: { data: Uint8Array }): Promise<Uint8Array>;
};

/**
 * Resolves the World's run key once for all storage boundaries of a session
 * handle. The deployment must be the run's original deployment, including
 * when a later deployment resumes it. Keys stay process-local; the World
 * owns retrieval and derivation, and an absent key disables encryption.
 */
export async function createStorageEncryption(options: {
  world: World;
  runId: string;
  deploymentId: string;
}): Promise<HarnessAgentStorageEncryption> {
  const { world, runId, deploymentId } = options;
  let key: CryptoKey | undefined;
  try {
    const raw = await world.getEncryptionKeyForRun?.(runId, { deploymentId });
    if (raw != null) key = await importKey(raw);
  } catch (cause) {
    throw new HarnessStorageEncryptionError({
      operation: 'resolve-key',
      cause,
    });
  }

  return {
    async encrypt({ data }) {
      if (key == null) return data;
      try {
        return await encrypt(key, data);
      } catch (cause) {
        throw new HarnessStorageEncryptionError({
          operation: 'encrypt',
          cause,
        });
      }
    },
    async decrypt({ data }) {
      if (key == null) return data;
      try {
        return await decrypt(key, data);
      } catch (cause) {
        throw new HarnessStorageEncryptionError({
          operation: 'decrypt',
          cause,
        });
      }
    },
  };
}
