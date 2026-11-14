import { Buffer } from 'node:buffer';
import {
  createPrivateKey,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from 'node:crypto';
import {
  createBridgeAuthMessage,
  parseBridgeAuthChallengeFrame,
  serializeBridgeAuthProofFrame,
} from './bridge-auth-protocol';

export interface BridgeAuthKeyPair {
  /**
   * Host-only PKCS#8 DER private key, base64url encoded. Never pass it into
   * the sandbox.
   */
  readonly privateKey: string;
  /**
   * Raw Ed25519 public key, base64url encoded. Safe to pass into the sandbox.
   */
  readonly publicKey: string;
}

export function createBridgeAuthKeyPair(): BridgeAuthKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const publicJwk = publicKey.export({ format: 'jwk' });
  if (typeof publicJwk.x !== 'string') {
    throw new Error('Failed to export the bridge authentication public key.');
  }
  return {
    privateKey: privateKey
      .export({ type: 'pkcs8', format: 'der' })
      .toString('base64url'),
    publicKey: publicJwk.x,
  };
}

export function parseBridgeAuthPrivateKey({
  privateKey,
}: {
  privateKey: string;
}): KeyObject {
  let key: KeyObject;
  try {
    key = createPrivateKey({
      key: Buffer.from(privateKey, 'base64url'),
      format: 'der',
      type: 'pkcs8',
    });
  } catch {
    throw new Error('Invalid bridge authentication private key.');
  }
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new Error('Bridge authentication requires an Ed25519 private key.');
  }
  return key;
}

export function createBridgeAuthProof({
  privateKey,
  message,
}: {
  privateKey: KeyObject;
  message: string;
}): string {
  const challenge = parseBridgeAuthChallengeFrame({ text: message });
  if (challenge == null) {
    throw new Error('Invalid bridge authentication challenge.');
  }
  return serializeBridgeAuthProofFrame({
    signature: sign(
      null,
      createBridgeAuthMessage({ challenge }),
      privateKey,
    ).toString('base64url'),
  });
}
