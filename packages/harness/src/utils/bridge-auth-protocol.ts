import { Buffer } from 'node:buffer';

export const BRIDGE_AUTH_PUBLIC_KEY_ENV = 'BRIDGE_AUTH_PUBLIC_KEY';
export const BRIDGE_AUTH_TIMEOUT_MS = 10_000;
export const BRIDGE_AUTH_MAX_FRAME_BYTES = 1_024;

const BRIDGE_AUTH_MESSAGE_PREFIX = 'ai-sdk-harness-bridge-auth-v1\0';
const CHALLENGE_FRAME_REGEXP =
  /^\{"type":"bridge-auth-challenge","challenge":"([a-f0-9]{64})"\}$/;
const PROOF_FRAME_REGEXP =
  /^\{"type":"bridge-auth-proof","signature":"([A-Za-z0-9_-]{86})"\}$/;

export function createBridgeAuthMessage({
  challenge,
}: {
  challenge: string;
}): Buffer {
  return Buffer.from(`${BRIDGE_AUTH_MESSAGE_PREFIX}${challenge}`, 'utf8');
}

export function serializeBridgeAuthChallengeFrame({
  challenge,
}: {
  challenge: string;
}): string {
  return JSON.stringify({ type: 'bridge-auth-challenge', challenge });
}

/*
 * Authentication frames are matched against their exact canonical
 * serialization instead of being parsed as JSON. The bridge bundle cannot
 * import the secure JSON parser from `@ai-sdk/provider-utils`, and an exact
 * match also rejects any frame with unexpected fields or encodings.
 */
export function parseBridgeAuthChallengeFrame({
  text,
}: {
  text: string;
}): string | undefined {
  return CHALLENGE_FRAME_REGEXP.exec(text)?.[1];
}

export function serializeBridgeAuthProofFrame({
  signature,
}: {
  signature: string;
}): string {
  return JSON.stringify({ type: 'bridge-auth-proof', signature });
}

export function parseBridgeAuthProofFrame({
  text,
}: {
  text: string;
}): string | undefined {
  return PROOF_FRAME_REGEXP.exec(text)?.[1];
}
