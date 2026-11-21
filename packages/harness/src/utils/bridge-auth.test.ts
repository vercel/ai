import { generateKeyPairSync, verify } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import {
  createBridgeAuthKeyPair,
  createBridgeAuthProof,
  parseBridgeAuthPrivateKey,
} from './bridge-auth';
import {
  createBridgeAuthMessage,
  parseBridgeAuthProofFrame,
  serializeBridgeAuthChallengeFrame,
} from './bridge-auth-protocol';

const CHALLENGE = '0123456789abcdef'.repeat(4);

describe('createBridgeAuthKeyPair', () => {
  it('creates distinct single-line base64url key pairs', () => {
    const first = createBridgeAuthKeyPair();
    const second = createBridgeAuthKeyPair();

    expect(first.publicKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.privateKey).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(first.privateKey).not.toBe(second.privateKey);
    expect(first.publicKey).not.toBe(second.publicKey);
  });
});

describe('parseBridgeAuthPrivateKey', () => {
  it('rejects malformed keys', () => {
    expect(() => parseBridgeAuthPrivateKey({ privateKey: 'nope' })).toThrow(
      'Invalid bridge authentication private key.',
    );
  });

  it('rejects non-Ed25519 keys', () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    expect(() =>
      parseBridgeAuthPrivateKey({
        privateKey: privateKey
          .export({ type: 'pkcs8', format: 'der' })
          .toString('base64url'),
      }),
    ).toThrow('Bridge authentication requires an Ed25519 private key.');
  });
});

describe('createBridgeAuthProof', () => {
  it('signs the challenge with the private key', () => {
    const keyPair = createBridgeAuthKeyPair();
    const proof = createBridgeAuthProof({
      privateKey: parseBridgeAuthPrivateKey({
        privateKey: keyPair.privateKey,
      }),
      message: serializeBridgeAuthChallengeFrame({ challenge: CHALLENGE }),
    });
    const signature = parseBridgeAuthProofFrame({ text: proof });

    expect(signature).toBeDefined();
    expect(
      verify(
        null,
        createBridgeAuthMessage({ challenge: CHALLENGE }),
        {
          key: { kty: 'OKP', crv: 'Ed25519', x: keyPair.publicKey },
          format: 'jwk',
        },
        Buffer.from(signature!, 'base64url'),
      ),
    ).toBe(true);
  });

  it('rejects frames that are not authentication challenges', () => {
    const keyPair = createBridgeAuthKeyPair();
    expect(() =>
      createBridgeAuthProof({
        privateKey: parseBridgeAuthPrivateKey({
          privateKey: keyPair.privateKey,
        }),
        message: JSON.stringify({ type: 'bridge-hello' }),
      }),
    ).toThrow('Invalid bridge authentication challenge.');
  });
});
