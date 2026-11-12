import { describe, expect, it } from 'vitest';
import {
  createBridgeAuthMessage,
  parseBridgeAuthChallengeFrame,
  parseBridgeAuthProofFrame,
  serializeBridgeAuthChallengeFrame,
  serializeBridgeAuthProofFrame,
} from './bridge-auth-protocol';

const CHALLENGE = 'a'.repeat(64);
const SIGNATURE = 'A'.repeat(86);

describe('bridge auth protocol', () => {
  it('creates a domain-separated message for the challenge', () => {
    expect(
      createBridgeAuthMessage({ challenge: CHALLENGE }).toString('utf8'),
    ).toBe(`ai-sdk-harness-bridge-auth-v1\0${CHALLENGE}`);
  });

  it('round-trips canonical challenge and proof frames', () => {
    const challengeFrame = serializeBridgeAuthChallengeFrame({
      challenge: CHALLENGE,
    });
    const proofFrame = serializeBridgeAuthProofFrame({ signature: SIGNATURE });

    expect(challengeFrame).toBe(
      `{"type":"bridge-auth-challenge","challenge":"${CHALLENGE}"}`,
    );
    expect(proofFrame).toBe(
      `{"type":"bridge-auth-proof","signature":"${SIGNATURE}"}`,
    );
    expect(parseBridgeAuthChallengeFrame({ text: challengeFrame })).toBe(
      CHALLENGE,
    );
    expect(parseBridgeAuthProofFrame({ text: proofFrame })).toBe(SIGNATURE);
  });

  it.each([
    `{"type":"bridge-auth-challenge","challenge":"${'A'.repeat(64)}"}`,
    `{"type":"bridge-auth-challenge","challenge":"${'a'.repeat(63)}"}`,
    `{"challenge":"${CHALLENGE}","type":"bridge-auth-challenge"}`,
    `{"type":"bridge-auth-challenge","challenge":"${CHALLENGE}","extra":1}`,
    ` {"type":"bridge-auth-challenge","challenge":"${CHALLENGE}"}`,
    `{"type":"bridge-hello"}`,
  ])('rejects non-canonical challenge frame %s', text => {
    expect(parseBridgeAuthChallengeFrame({ text })).toBeUndefined();
  });

  it.each([
    `{"type":"bridge-auth-proof","signature":"${'A'.repeat(85)}"}`,
    `{"type":"bridge-auth-proof","signature":"${'A'.repeat(85)}="}`,
    `{"signature":"${SIGNATURE}","type":"bridge-auth-proof"}`,
    `{"type":"bridge-auth-proof","signature":"${SIGNATURE}","extra":1}`,
    `{"type":"start"}`,
  ])('rejects non-canonical proof frame %s', text => {
    expect(parseBridgeAuthProofFrame({ text })).toBeUndefined();
  });
});
