import { describe, expect, it } from 'vitest';
import { hashCanonical, toBase64url } from '../util/canonical-hash';
import {
  signToolApproval,
  verifyToolApprovalSignature,
} from './tool-approval-signature';

const secret = 'test-secret-key-for-hmac-signing';

// Produces a signature in the legacy newline-joined payload format that the
// pre-JSON version emitted, so the backwards-compat fallback can be tested.
async function signLegacy({
  approvalId,
  toolCallId,
  toolName,
  input,
}: {
  approvalId: string;
  toolCallId: string;
  toolName: string;
  input: unknown;
}): Promise<string> {
  const inputDigest = await hashCanonical(input);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const payload = new TextEncoder().encode(
    `${approvalId}\n${toolCallId}\n${toolName}\n${inputDigest}`,
  );
  const sig = await crypto.subtle.sign('HMAC', key, payload);
  return toBase64url(new Uint8Array(sig));
}

describe('signToolApproval + verifyToolApprovalSignature', () => {
  const baseParams = {
    approvalId: 'approval-1',
    toolCallId: 'call-1',
    toolName: 'deleteFile',
    input: { path: '/tmp/cache' },
  };

  it('should produce a valid signature that verifies', async () => {
    const signature = await signToolApproval({ secret, ...baseParams });
    expect(typeof signature).toBe('string');
    expect(signature.length).toBeGreaterThan(0);

    const valid = await verifyToolApprovalSignature({
      secret,
      signature,
      ...baseParams,
    });
    expect(valid).toBe(true);
  });

  it('should reject when the approvalId is tampered', async () => {
    const signature = await signToolApproval({ secret, ...baseParams });
    const valid = await verifyToolApprovalSignature({
      secret,
      signature,
      ...baseParams,
      approvalId: 'tampered-id',
    });
    expect(valid).toBe(false);
  });

  it('should reject when the toolCallId is tampered', async () => {
    const signature = await signToolApproval({ secret, ...baseParams });
    const valid = await verifyToolApprovalSignature({
      secret,
      signature,
      ...baseParams,
      toolCallId: 'tampered-call',
    });
    expect(valid).toBe(false);
  });

  it('should reject when the toolName is tampered', async () => {
    const signature = await signToolApproval({ secret, ...baseParams });
    const valid = await verifyToolApprovalSignature({
      secret,
      signature,
      ...baseParams,
      toolName: 'readFile',
    });
    expect(valid).toBe(false);
  });

  it('should reject when the input is tampered', async () => {
    const signature = await signToolApproval({ secret, ...baseParams });
    const valid = await verifyToolApprovalSignature({
      secret,
      signature,
      ...baseParams,
      input: { path: '/app/.env' },
    });
    expect(valid).toBe(false);
  });

  it('should reject when verified with a different secret', async () => {
    const signature = await signToolApproval({ secret, ...baseParams });
    const valid = await verifyToolApprovalSignature({
      secret: 'different-secret',
      signature,
      ...baseParams,
    });
    expect(valid).toBe(false);
  });

  it('should produce the same signature for equivalent inputs with different key order', async () => {
    const sig1 = await signToolApproval({
      secret,
      ...baseParams,
      input: { path: '/tmp/cache', mode: 'delete' },
    });
    const sig2 = await signToolApproval({
      secret,
      ...baseParams,
      input: { mode: 'delete', path: '/tmp/cache' },
    });
    expect(sig1).toBe(sig2);
  });

  // A newline in toolName must not be retupleable into toolCallId to forge a
  // matching signature for a different tool.
  it('should not collide when a newline in toolName is retupled into toolCallId', async () => {
    const signed = {
      approvalId: 'approval-1',
      toolCallId: 'call-1',
      toolName: 'searchDocs\ndeleteFile',
      input: { path: '/tmp/target' },
    };
    const retupled = {
      approvalId: 'approval-1',
      toolCallId: 'call-1\nsearchDocs',
      toolName: 'deleteFile',
      input: { path: '/tmp/target' },
    };

    const signature = await signToolApproval({ secret, ...signed });

    // The signature issued for the newline-bearing tool must NOT verify against
    // the retupled tuple that targets a different registered tool.
    expect(
      await verifyToolApprovalSignature({ secret, signature, ...retupled }),
    ).toBe(false);

    // The two tuples must produce distinct signatures.
    const retupledSignature = await signToolApproval({ secret, ...retupled });
    expect(signature).not.toBe(retupledSignature);

    // Sanity: each signature still verifies against its own tuple.
    expect(
      await verifyToolApprovalSignature({ secret, signature, ...signed }),
    ).toBe(true);
    expect(
      await verifyToolApprovalSignature({
        secret,
        signature: retupledSignature,
        ...retupled,
      }),
    ).toBe(true);
  });

  // Any delimiter/control character shifted across a field boundary must fail.
  it.each([
    ['newline', '\n'],
    ['carriage return', '\r'],
    ['tab', '\t'],
    ['null byte', '\0'],
    ['json quote', '"'],
    ['json backslash', '\\'],
  ])('should not collide across the %s delimiter', async (_label, delim) => {
    const signed = {
      approvalId: 'approval-1',
      toolCallId: 'call-1',
      toolName: `alpha${delim}beta`,
      input: { path: '/tmp/target' },
    };
    const retupled = {
      approvalId: 'approval-1',
      toolCallId: `call-1${delim}alpha`,
      toolName: 'beta',
      input: { path: '/tmp/target' },
    };
    const signature = await signToolApproval({ secret, ...signed });
    expect(
      await verifyToolApprovalSignature({ secret, signature, ...retupled }),
    ).toBe(false);
  });

  // Backwards compatibility with pre-JSON signatures.
  it('should still verify a legacy newline-format signature when no field contains a newline', async () => {
    const legacy = await signLegacy(baseParams);
    expect(
      await verifyToolApprovalSignature({
        secret,
        signature: legacy,
        ...baseParams,
      }),
    ).toBe(true);
  });

  // The legacy fallback must not reopen the collision: a legacy signature over
  // a newline-bearing tool cannot be reused for a retupled tuple, because the
  // retupled tuple has a newline in a field and the fallback is refused.
  it('should not accept a legacy signature through the retupling collision', async () => {
    const legacy = await signLegacy({
      approvalId: 'approval-1',
      toolCallId: 'call-1',
      toolName: 'searchDocs\ndeleteFile',
      input: { path: '/tmp/target' },
    });
    expect(
      await verifyToolApprovalSignature({
        secret,
        signature: legacy,
        approvalId: 'approval-1',
        toolCallId: 'call-1\nsearchDocs',
        toolName: 'deleteFile',
        input: { path: '/tmp/target' },
      }),
    ).toBe(false);
  });
});
