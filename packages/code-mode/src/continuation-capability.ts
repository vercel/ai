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

/**
 * Sets the process-global continuation signing key.
 *
 * Hosts that need approval or interrupt continuations to survive process
 * restarts must configure the same secret before creating and resuming
 * continuations. Calling without arguments restores a random process-local key.
 *
 * @param key - Secret key bytes or UTF-8 string, or `undefined` to reset.
 * @param options - Optional continuation signing policy.
 */
export function setCodeModeContinuationSigningKey(
  key?: string | Uint8Array,
  options: { maxAgeMs?: number } = {},
): void {
  const nextSigningKey = key ?? randomBytes(32);
  const resolved = resolveCodeModeContinuationSecurity({
    signingKey: nextSigningKey,
    maxAgeMs: options.maxAgeMs ?? DEFAULT_MAX_AGE_MS,
  });
  defaultSigningKey = resolved.signingKey;
  defaultMaxAgeMs = resolved.maxAgeMs;
}

/**
 * Resolves continuation security for one invocation without mutating process
 * defaults.
 *
 * @internal
 */
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

/**
 * Signs a host-created continuation as an unforgeable bearer capability.
 *
 * @internal
 */
export function signCodeModeContinuation(
  continuation: UnsignedCodeModeContinuation,
  security: ResolvedCodeModeContinuationSecurity = resolveCodeModeContinuationSecurity(),
): CodeModeContinuation {
  const issuedAtMs = Date.now();
  const auth: Omit<CodeModeContinuationAuth, 'signature'> = {
    alg: SIGNATURE_ALGORITHM,
    nonce: randomBytes(16).toString('hex'),
    issuedAtMs,
    expiresAtMs: issuedAtMs + security.maxAgeMs,
  };
  const signature = signContinuationPayload(
    { ...continuation, auth },
    security.signingKey,
  );
  return {
    ...structuredClone(continuation),
    auth: {
      ...auth,
      signature,
    },
  };
}

/**
 * Verifies that a continuation was issued by this host and has not expired.
 *
 * @internal
 */
export function verifyCodeModeContinuation(
  continuation: CodeModeContinuation,
  security: CodeModeContinuationSecurityOptions = {},
): void {
  const auth = continuation.auth;
  assertAuthShape(auth);
  const now = Date.now();
  if (auth.expiresAtMs < now) {
    throw new CodeModeProtocolError('Code mode continuation has expired.', {
      expiresAtMs: auth.expiresAtMs,
      now,
    });
  }
  if (auth.issuedAtMs > now + 60_000) {
    throw new CodeModeProtocolError(
      'Code mode continuation was issued in the future.',
      { issuedAtMs: auth.issuedAtMs, now },
    );
  }

  const { signingKey } = resolveCodeModeContinuationSecurity(security);
  const expected = signContinuationPayload(
    stripSignature(continuation),
    signingKey,
  );
  if (!constantTimeEqual(auth.signature, expected)) {
    throw new CodeModeProtocolError(
      'Code mode continuation signature is invalid.',
    );
  }
}

/**
 * Returns whether a value is a currently valid signed continuation.
 *
 * @internal
 */
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
  return {
    ...rest,
    auth: unsignedAuth,
  };
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
  const type = typeof value;
  if (type === 'string' || type === 'boolean') {
    return JSON.stringify(value);
  }
  if (type === 'number') {
    if (!Number.isFinite(value as number)) {
      throw new CodeModeProtocolError(
        'Code mode continuation contains a non-finite number.',
      );
    }
    return JSON.stringify(value);
  }
  if (
    type === 'undefined' ||
    type === 'function' ||
    type === 'symbol' ||
    type === 'bigint'
  ) {
    throw new CodeModeProtocolError(
      'Code mode continuation contains a non-JSON value.',
    );
  }
  if (typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => canonicalJson(item)).join(',')}]`;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new CodeModeProtocolError(
      'Code mode continuation contains a non-plain object.',
    );
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}
