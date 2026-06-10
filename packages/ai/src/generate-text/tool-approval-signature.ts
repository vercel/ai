const encoder = new TextEncoder();

function canonicalJSON(value: unknown): string {
  if (value === null || value === undefined) {
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJSON).join(',')}]`;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const entries = keys.map(
    k =>
      `${JSON.stringify(k)}:${canonicalJSON((value as Record<string, unknown>)[k])}`,
  );
  return `{${entries.join(',')}}`;
}

function uint8ArrayToBase64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64urlToUint8Array(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

let cachedKeyMaterial: string | Uint8Array | undefined;
let cachedKey: CryptoKey | undefined;

async function importKey(secret: string | Uint8Array): Promise<CryptoKey> {
  if (cachedKey != null && cachedKeyMaterial === secret) {
    return cachedKey;
  }
  const keyData = typeof secret === 'string' ? encoder.encode(secret) : secret;
  cachedKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  cachedKeyMaterial = secret;
  return cachedKey;
}

async function hashInput(input: unknown): Promise<string> {
  const canonical = canonicalJSON(input);
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(canonical),
  );
  return uint8ArrayToBase64url(new Uint8Array(digest));
}

function buildPayload(
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
  const inputDigest = await hashInput(input);
  const payload = buildPayload(approvalId, toolCallId, toolName, inputDigest);
  const sig = await crypto.subtle.sign('HMAC', key, payload);
  return uint8ArrayToBase64url(new Uint8Array(sig));
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
  const inputDigest = await hashInput(input);
  const payload = buildPayload(approvalId, toolCallId, toolName, inputDigest);
  const sigBytes = base64urlToUint8Array(signature);
  return crypto.subtle.verify('HMAC', key, sigBytes, payload);
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

export { canonicalJSON as _canonicalJSON_forTesting };
