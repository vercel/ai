import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { CodeModeProtocolError } from './errors.js';
import type {
  CodeModeContinuation,
  CodeModeContinuationAuth,
  CodeModeContinuationSecurityOptions,
  UnsignedCodeModeContinuation,
} from './types.js';

const SIGNATURE_ALGORITHM = 'HMAC-SHA256';
const DEFAULT_MAX_AGE_MS = 60 * 60 * 1000;

let defaultSigningKey: Uint8Array = randomBytes(32);
let defaultMaxAgeMs = DEFAULT_MAX_AGE_MS;

export interface ResolvedCodeModeContinuationSecurity {
  signingKey: Buffer;
  maxAgeMs: number;
}

export function setCodeModeContinuationSigningKey(
  key?: string | Uint8Array,
  options: { maxAgeMs?: number } = {},
): void {
  const resolved = resolveCodeModeContinuationSecurity({
    signingKey: key ?? randomBytes(32),
    maxAgeMs: options.maxAgeMs ?? DEFAULT_MAX_AGE_MS,
  });
  defaultSigningKey = resolved.signingKey;
  defaultMaxAgeMs = resolved.maxAgeMs;
}

export function resolveCodeModeContinuationSecurity(
  options: CodeModeContinuationSecurityOptions = {},
): ResolvedCodeModeContinuationSecurity {
  const signingKey =
    options.signingKey === undefined
      ? Buffer.from(defaultSigningKey)
      : typeof options.signingKey === 'string'
        ? Buffer.from(options.signingKey)
        : Buffer.from(options.signingKey);
  if (signingKey.byteLength === 0) {
    throw new TypeError('Continuation signing key must not be empty.');
  }

  const maxAgeMs = options.maxAgeMs ?? defaultMaxAgeMs;
  if (
    !Number.isInteger(maxAgeMs) ||
    !Number.isFinite(maxAgeMs) ||
    maxAgeMs <= 0
  ) {
    throw new TypeError('Continuation maxAgeMs must be a positive integer.');
  }

  return { signingKey, maxAgeMs };
}

export function signCodeModeContinuation(
  continuation: UnsignedCodeModeContinuation,
  security = resolveCodeModeContinuationSecurity(),
): CodeModeContinuation {
  const issuedAtMs = Date.now();
  const auth: Omit<CodeModeContinuationAuth, 'signature'> = {
    alg: SIGNATURE_ALGORITHM,
    nonce: randomBytes(16).toString('hex'),
    issuedAtMs,
    expiresAtMs: issuedAtMs + security.maxAgeMs,
  };
  return {
    ...structuredClone(continuation),
    auth: {
      ...auth,
      signature: signContinuationPayload(
        { ...continuation, auth },
        security.signingKey,
      ),
    },
  };
}

export function verifyCodeModeContinuation(
  continuation: CodeModeContinuation,
  security: CodeModeContinuationSecurityOptions = {},
): void {
  if (
    typeof continuation !== 'object' ||
    continuation === null ||
    continuation.version !== 2 ||
    typeof continuation.js !== 'string' ||
    typeof continuation.outerToolCallId !== 'string' ||
    !Array.isArray(continuation.toolNames) ||
    !continuation.toolNames.every(name => typeof name === 'string') ||
    typeof continuation.token !== 'string' ||
    continuation.token.length === 0 ||
    !Array.isArray(continuation.pendingInterruptions) ||
    continuation.pendingInterruptions.length === 0 ||
    !Array.isArray(continuation.resolutions)
  ) {
    throw new CodeModeProtocolError(
      'Code mode continuation envelope is malformed.',
    );
  }
  assertAuthShape(continuation.auth);
  const now = Date.now();
  if (continuation.auth.expiresAtMs < now) {
    throw new CodeModeProtocolError('Code mode continuation has expired.', {
      expiresAtMs: continuation.auth.expiresAtMs,
      now,
    });
  }
  if (continuation.auth.issuedAtMs > now + 60_000) {
    throw new CodeModeProtocolError(
      'Code mode continuation was issued in the future.',
      { issuedAtMs: continuation.auth.issuedAtMs, now },
    );
  }

  const { signingKey } = resolveCodeModeContinuationSecurity(security);
  const expected = signContinuationPayload(
    stripSignature(continuation),
    signingKey,
  );
  if (!constantTimeEqual(continuation.auth.signature, expected)) {
    throw new CodeModeProtocolError(
      'Code mode continuation signature is invalid.',
    );
  }
}

export function hasValidCodeModeContinuationCapability(
  value: unknown,
  security: CodeModeContinuationSecurityOptions = {},
): value is CodeModeContinuation {
  try {
    verifyCodeModeContinuation(value as CodeModeContinuation, security);
    return true;
  } catch {
    return false;
  }
}

function signContinuationPayload(
  continuation: UnsignedCodeModeContinuation & {
    auth: Omit<CodeModeContinuationAuth, 'signature'>;
  },
  signingKey: Uint8Array,
): string {
  return createHmac('sha256', signingKey)
    .update(canonicalJson(continuation))
    .digest('base64url');
}

function stripSignature(
  continuation: CodeModeContinuation,
): UnsignedCodeModeContinuation & {
  auth: Omit<CodeModeContinuationAuth, 'signature'>;
} {
  const { auth, ...rest } = continuation;
  const { signature: _signature, ...unsignedAuth } = auth;
  return { ...rest, auth: unsignedAuth };
}

function assertAuthShape(
  auth: unknown,
): asserts auth is CodeModeContinuationAuth {
  if (
    typeof auth !== 'object' ||
    auth === null ||
    Array.isArray(auth) ||
    (auth as { alg?: unknown }).alg !== SIGNATURE_ALGORITHM ||
    typeof (auth as { nonce?: unknown }).nonce !== 'string' ||
    !/^[0-9a-f]{32}$/i.test((auth as { nonce: string }).nonce) ||
    typeof (auth as { issuedAtMs?: unknown }).issuedAtMs !== 'number' ||
    !Number.isInteger((auth as { issuedAtMs: number }).issuedAtMs) ||
    typeof (auth as { expiresAtMs?: unknown }).expiresAtMs !== 'number' ||
    !Number.isInteger((auth as { expiresAtMs: number }).expiresAtMs) ||
    (auth as { expiresAtMs: number }).expiresAtMs <=
      (auth as { issuedAtMs: number }).issuedAtMs ||
    typeof (auth as { signature?: unknown }).signature !== 'string' ||
    (auth as { signature: string }).signature.length === 0
  ) {
    throw new CodeModeProtocolError(
      'Code mode continuation is missing valid signed auth metadata.',
    );
  }
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.byteLength === rightBytes.byteLength &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

function canonicalJson(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  throw new TypeError('Continuation contains a non-JSON-serializable value.');
}
