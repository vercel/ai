import { convertBase64ToUint8Array } from '@ai-sdk/provider-utils';
import { hashCanonical, toBase64url } from '../util/canonical-hash';

const encoder = new TextEncoder();

function fromBase64url(str: string): Uint8Array {
  return convertBase64ToUint8Array(str);
}

async function importKey(secret: string | Uint8Array): Promise<CryptoKey> {
  const keyData = typeof secret === 'string' ? encoder.encode(secret) : secret;
  return crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

// Serialize with JSON so the encoding is injective: fields may contain any
// character (including newlines), and escaping + array structure keeps field
// boundaries unambiguous. The version prefix provides domain separation.
function buildPayload(
  approvalId: string,
  toolCallId: string,
  toolName: string,
  inputDigest: string,
): Uint8Array {
  return encoder.encode(
    JSON.stringify([
      'ai-sdk-tool-approval-v1',
      approvalId,
      toolCallId,
      toolName,
      inputDigest,
    ]),
  );
}

// Legacy newline-joined payload. Ambiguous when any field contains the `\n`
// delimiter, which is why it was replaced; only used as a verify-time fallback
// guarded on delimiter-free fields.
// TODO(#17494): remove in v8 when backwards compatibility with pre-JSON
// signatures (approvals signed before the injective format) is no longer
// needed.
function buildLegacyPayload(
  approvalId: string,
  toolCallId: string,
  toolName: string,
  inputDigest: string,
): Uint8Array {
  return encoder.encode(
    `${approvalId}\n${toolCallId}\n${toolName}\n${inputDigest}`,
  );
}

export async function signToolApproval({
  secret,
  approvalId,
  toolCallId,
  toolName,
  input,
}: {
  secret: string | Uint8Array;
  approvalId: string;
  toolCallId: string;
  toolName: string;
  input: unknown;
}): Promise<string> {
  const key = await importKey(secret);
  const inputDigest = await hashCanonical(input);
  const payload = buildPayload(approvalId, toolCallId, toolName, inputDigest);
  const sig = await crypto.subtle.sign('HMAC', key, payload);
  return toBase64url(new Uint8Array(sig));
}

export async function verifyToolApprovalSignature({
  secret,
  signature,
  approvalId,
  toolCallId,
  toolName,
  input,
}: {
  secret: string | Uint8Array;
  signature: string;
  approvalId: string;
  toolCallId: string;
  toolName: string;
  input: unknown;
}): Promise<boolean> {
  const key = await importKey(secret);
  const inputDigest = await hashCanonical(input);
  const sigBytes = fromBase64url(signature);

  const payload = buildPayload(approvalId, toolCallId, toolName, inputDigest);
  if (await crypto.subtle.verify('HMAC', key, sigBytes, payload)) {
    return true;
  }

  // Backwards compatibility: accept a signature produced by the legacy
  // newline-joined format, but only when no field contains the `\n` delimiter
  // — the exact condition that made that format ambiguous. This keeps the
  // retupling collision closed (the attack requires a newline in a field)
  // while still verifying benign approvals signed by an older version, e.g. a
  // pending approval that straddles an upgrade.
  // TODO(#17494): remove in v8 (drop buildLegacyPayload and this fallback).
  if (
    !approvalId.includes('\n') &&
    !toolCallId.includes('\n') &&
    !toolName.includes('\n')
  ) {
    const legacyPayload = buildLegacyPayload(
      approvalId,
      toolCallId,
      toolName,
      inputDigest,
    );
    return crypto.subtle.verify('HMAC', key, sigBytes, legacyPayload);
  }

  return false;
}

export async function maybeSignApproval({
  secret,
  approvalId,
  toolCallId,
  toolName,
  input,
}: {
  secret: string | Uint8Array | undefined;
  approvalId: string;
  toolCallId: string;
  toolName: string;
  input: unknown;
}): Promise<string | undefined> {
  if (secret == null) return undefined;
  return signToolApproval({ secret, approvalId, toolCallId, toolName, input });
}
