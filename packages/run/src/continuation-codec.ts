import { Buffer } from 'node:buffer';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { RunProtocolError } from './errors.js';
import type {
  ContinuationCodec,
  ContinuationOperationContext,
  RunContinuationState,
} from './types.js';
import { parseJson } from './utils/parse-json.js';
import { hasExactKeys, isPlainRecord } from './utils/object-validation.js';

const DEFAULT_MAX_AGE_MS = 60 * 60 * 1000;
const DEFAULT_MAX_TOKEN_BYTES = 32 * 1024 * 1024;
const DEFAULT_CLOCK_SKEW_MS = 60_000;
const SIGNATURE_DOMAIN = 'run.continuation.v1\0';
const ENVELOPE_KEYS = [
  'algorithm',
  'expiresAtMs',
  'format',
  'issuedAtMs',
  'nonce',
  'state',
  'version',
] as const;

export interface SignedContinuationCodecOptions {
  /** Primary HMAC key used for new tokens and verification. */
  secret: string | Uint8Array;
  /** Previous HMAC keys accepted only for verification during key rotation. */
  verificationSecrets?: Array<string | Uint8Array>;
  maxAgeMs?: number;
  maxTokenBytes?: number;
  /** Allowed positive clock skew for issued-at validation. @defaultValue `60_000` */
  clockSkewMs?: number;
}

export function createSignedContinuationCodec(
  options: SignedContinuationCodecOptions,
): ContinuationCodec<string> {
  const primarySecret = Buffer.from(options.secret);
  assertSecret(primarySecret);
  const verificationSecrets = (options.verificationSecrets ?? []).map(value =>
    Buffer.from(value),
  );
  for (const secret of verificationSecrets) assertSecret(secret);
  const secrets = [primarySecret, ...verificationSecrets];
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  if (!Number.isSafeInteger(maxAgeMs) || maxAgeMs <= 0) {
    throw new TypeError('Continuation maxAgeMs must be a positive integer.');
  }
  const maxTokenBytes = options.maxTokenBytes ?? DEFAULT_MAX_TOKEN_BYTES;
  if (!Number.isSafeInteger(maxTokenBytes) || maxTokenBytes <= 0) {
    throw new TypeError(
      'Continuation maxTokenBytes must be a positive integer.',
    );
  }
  const clockSkewMs = options.clockSkewMs ?? DEFAULT_CLOCK_SKEW_MS;
  if (!Number.isSafeInteger(clockSkewMs) || clockSkewMs < 0) {
    throw new TypeError(
      'Continuation clockSkewMs must be a non-negative integer.',
    );
  }

  return {
    encode(state) {
      const issuedAtMs = Date.now();
      const payload = {
        format: 'run-continuation',
        version: 1,
        algorithm: 'HS256',
        state: structuredClone(state),
        issuedAtMs,
        expiresAtMs: issuedAtMs + maxAgeMs,
        nonce: randomBytes(16).toString('hex'),
      };
      const body = Buffer.from(canonicalJson(payload)).toString('base64url');
      const signature = sign(body, primarySecret);
      const token = `${body}.${signature}`;
      assertTokenLength(token, maxTokenBytes);
      return token;
    },
    decode(token) {
      if (typeof token !== 'string') {
        throw new RunProtocolError('Continuation token must be a string.');
      }
      assertTokenLength(token, maxTokenBytes);
      const separator = token.lastIndexOf('.');
      if (separator <= 0) {
        throw new RunProtocolError('Continuation token is malformed.');
      }
      const body = token.slice(0, separator);
      const signature = token.slice(separator + 1);
      const bodyBytes = decodeBase64Url(body, 'Continuation payload');
      if (!verifySignature(body, signature, secrets)) {
        throw new RunProtocolError('Continuation signature is invalid.');
      }
      let payload: unknown;
      try {
        payload = parseJson(bodyBytes.toString('utf8'));
      } catch {
        throw new RunProtocolError('Continuation payload is malformed.');
      }
      if (!isEnvelope(payload)) {
        throw new RunProtocolError('Continuation envelope is invalid.');
      }
      if (Buffer.from(canonicalJson(payload)).toString('base64url') !== body) {
        throw new RunProtocolError(
          'Continuation payload is not canonically encoded.',
        );
      }
      const now = Date.now();
      if (payload.expiresAtMs <= now) {
        throw new RunProtocolError('Continuation has expired.');
      }
      if (payload.issuedAtMs > now + clockSkewMs) {
        throw new RunProtocolError('Continuation was issued in the future.');
      }
      if (payload.expiresAtMs - payload.issuedAtMs > maxAgeMs) {
        throw new RunProtocolError('Continuation lifetime is invalid.');
      }
      return structuredClone(payload.state);
    },
  };
}

export interface ContinuationStorage {
  set(
    key: string,
    value: StoredContinuation,
    context?: ContinuationOperationContext,
  ): void | Promise<void>;
  /** Atomically reads and removes a continuation. */
  take(
    key: string,
    context?: ContinuationOperationContext,
  ): StoredContinuation | undefined | Promise<StoredContinuation | undefined>;
}

export interface StoredContinuation {
  state: RunContinuationState;
  expiresAtMs: number;
}

export function createStoredContinuationCodec({
  storage,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
}: {
  storage: ContinuationStorage;
  maxAgeMs?: number;
}): ContinuationCodec<string> {
  if (!Number.isSafeInteger(maxAgeMs) || maxAgeMs <= 0) {
    throw new TypeError('Continuation maxAgeMs must be a positive integer.');
  }
  return {
    async encode(state, context) {
      const key = randomBytes(32).toString('base64url');
      throwIfOperationAborted(context);
      await storage.set(
        key,
        {
          state: structuredClone(state),
          expiresAtMs: Date.now() + maxAgeMs,
        },
        context,
      );
      throwIfOperationAborted(context);
      return key;
    },
    async decode(key, context) {
      throwIfOperationAborted(context);
      if (
        typeof key !== 'string' ||
        !/^[A-Za-z0-9_-]{43}$/u.test(key) ||
        Buffer.from(key, 'base64url').toString('base64url') !== key
      ) {
        throw new RunProtocolError('Stored continuation key is invalid.');
      }
      const stored = await storage.take(key, context);
      throwIfOperationAborted(context);
      if (stored === undefined) {
        throw new RunProtocolError('Stored continuation was not found.');
      }
      if (
        !isPlainRecord(stored) ||
        !hasExactKeys(stored, ['expiresAtMs', 'state']) ||
        !Number.isSafeInteger(stored.expiresAtMs)
      ) {
        throw new RunProtocolError('Stored continuation envelope is invalid.');
      }
      if (stored.expiresAtMs <= Date.now()) {
        throw new RunProtocolError('Stored continuation has expired.');
      }
      return structuredClone(stored.state);
    },
  };
}

function throwIfOperationAborted(
  context: ContinuationOperationContext | undefined,
): void {
  if (context?.abortSignal.aborted) {
    throw (
      context.abortSignal.reason ??
      new DOMException('The continuation operation was aborted.', 'AbortError')
    );
  }
}

function sign(body: string, secret: Uint8Array): string {
  return createHmac('sha256', secret)
    .update(SIGNATURE_DOMAIN)
    .update(body)
    .digest('base64url');
}

function verifySignature(
  body: string,
  signature: string,
  secrets: Uint8Array[],
): boolean {
  let received: Buffer;
  try {
    received = decodeBase64Url(signature, 'Continuation signature');
  } catch {
    return false;
  }
  let valid = false;
  for (const secret of secrets) {
    const expected = Buffer.from(sign(body, secret), 'base64url');
    const sameLength = received.byteLength === expected.byteLength;
    const candidate = sameLength ? received : Buffer.alloc(expected.byteLength);
    valid = timingSafeEqual(candidate, expected) || valid;
  }
  return valid;
}

function isEnvelope(value: unknown): value is {
  format: 'run-continuation';
  version: 1;
  algorithm: 'HS256';
  state: RunContinuationState;
  issuedAtMs: number;
  expiresAtMs: number;
  nonce: string;
} {
  return (
    isPlainRecord(value) &&
    hasExactKeys(value, [...ENVELOPE_KEYS]) &&
    value.format === 'run-continuation' &&
    value.version === 1 &&
    value.algorithm === 'HS256' &&
    typeof (value as { issuedAtMs?: unknown }).issuedAtMs === 'number' &&
    Number.isSafeInteger((value as { issuedAtMs: number }).issuedAtMs) &&
    typeof (value as { expiresAtMs?: unknown }).expiresAtMs === 'number' &&
    Number.isSafeInteger((value as { expiresAtMs: number }).expiresAtMs) &&
    (value as { expiresAtMs: number }).expiresAtMs >
      (value as { issuedAtMs: number }).issuedAtMs &&
    typeof (value as { nonce?: unknown }).nonce === 'string' &&
    /^[0-9a-f]{32}$/u.test((value as { nonce: string }).nonce) &&
    typeof (value as { state?: unknown }).state === 'object' &&
    (value as { state?: unknown }).state !== null
  );
}

function canonicalJson(value: unknown, seen = new WeakSet<object>()): string {
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    if (
      encoded === undefined ||
      typeof value === 'bigint' ||
      (typeof value === 'number' && !Number.isFinite(value))
    ) {
      throw new RunProtocolError('Continuation contains a non-JSON value.');
    }
    return encoded;
  }
  if (seen.has(value)) {
    throw new RunProtocolError('Continuation contains a cyclic value.');
  }
  seen.add(value);
  if (Array.isArray(value)) {
    const items: string[] = [];
    for (let index = 0; index < value.length; index++) {
      if (!Object.hasOwn(value, index)) {
        throw new RunProtocolError('Continuation contains a sparse array.');
      }
      items.push(canonicalJson(value[index], seen));
    }
    seen.delete(value);
    return `[${items.join(',')}]`;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new RunProtocolError('Continuation contains a non-plain object.');
  }
  const record = value as Record<string, unknown>;
  const result = `{${Object.keys(record)
    .sort()
    .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key], seen)}`)
    .join(',')}}`;
  seen.delete(value);
  return result;
}

function assertTokenLength(token: string, maxBytes: number): void {
  const bytes = Buffer.byteLength(token);
  if (bytes > maxBytes) {
    throw new RunProtocolError(
      `Continuation token exceeds the ${maxBytes} byte size limit.`,
      { bytes, maxBytes },
    );
  }
}

function decodeBase64Url(value: string, label: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new RunProtocolError(`${label} is malformed.`);
  }
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.toString('base64url') !== value) {
    throw new RunProtocolError(`${label} is malformed.`);
  }
  return decoded;
}

function assertSecret(secret: Uint8Array): void {
  if (secret.byteLength < 32) {
    throw new TypeError(
      'Continuation secret must contain at least 32 bytes of key material.',
    );
  }
}
