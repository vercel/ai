import { Buffer } from 'node:buffer';
import {
  createPublicKey,
  randomBytes,
  verify,
  type KeyObject,
} from 'node:crypto';
import type { RawData, WebSocket } from 'ws';
import {
  BRIDGE_AUTH_MAX_FRAME_BYTES,
  BRIDGE_AUTH_TIMEOUT_MS,
  createBridgeAuthMessage,
  parseBridgeAuthProofFrame,
  serializeBridgeAuthChallengeFrame,
} from '../utils/bridge-auth-protocol';

const PUBLIC_KEY_REGEXP = /^[A-Za-z0-9_-]{43}$/;
const UNAUTHORIZED_CLOSE_CODE = 1008;
const INVALID_PUBLIC_KEY_MESSAGE =
  'The bridge requires a valid Ed25519 public key for authentication.';

export function parseBridgeAuthPublicKey({
  publicKey,
}: {
  publicKey: string | undefined;
}): KeyObject {
  if (publicKey == null || !PUBLIC_KEY_REGEXP.test(publicKey)) {
    throw new Error(INVALID_PUBLIC_KEY_MESSAGE);
  }
  let key: KeyObject;
  try {
    key = createPublicKey({
      key: { kty: 'OKP', crv: 'Ed25519', x: publicKey },
      format: 'jwk',
    });
  } catch {
    throw new Error(INVALID_PUBLIC_KEY_MESSAGE);
  }
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new Error(INVALID_PUBLIC_KEY_MESSAGE);
  }
  return key;
}

/*
 * Every connection receives a fresh challenge, so a captured proof cannot
 * authenticate a later connection. `onAuthenticated` runs synchronously in the
 * proof frame's message handler: handlers it installs see every later frame,
 * and no frame reaches them before the proof was verified.
 */
export function authenticateBridgeConnection({
  ws,
  publicKey,
  timeoutMs = BRIDGE_AUTH_TIMEOUT_MS,
  onAuthenticated,
}: {
  ws: WebSocket;
  publicKey: KeyObject;
  timeoutMs?: number;
  onAuthenticated: () => void;
}): void {
  const challenge = randomBytes(32).toString('hex');
  const timeout = setTimeout(() => ws.terminate(), timeoutMs);
  timeout.unref?.();
  const onError = () => {};
  ws.on('error', onError);
  ws.once('close', () => clearTimeout(timeout));
  ws.once('message', (raw: RawData, isBinary: boolean) => {
    clearTimeout(timeout);
    const text = isBinary ? undefined : rawDataToString(raw);
    const signature =
      text == null ? undefined : parseBridgeAuthProofFrame({ text });
    if (
      signature == null ||
      !verify(
        null,
        createBridgeAuthMessage({ challenge }),
        publicKey,
        Buffer.from(signature, 'base64url'),
      )
    ) {
      ws.close(UNAUTHORIZED_CLOSE_CODE, 'unauthorized');
      return;
    }
    ws.off('error', onError);
    onAuthenticated();
  });
  ws.send(serializeBridgeAuthChallengeFrame({ challenge }));
}

function rawDataToString(raw: RawData): string | undefined {
  const buffer = Array.isArray(raw)
    ? Buffer.concat(raw)
    : Buffer.isBuffer(raw)
      ? raw
      : Buffer.from(raw);
  if (buffer.byteLength > BRIDGE_AUTH_MAX_FRAME_BYTES) return undefined;
  return buffer.toString('utf8');
}
