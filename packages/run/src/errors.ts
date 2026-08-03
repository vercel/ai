import { Buffer } from 'node:buffer';
import type { SerializableError } from './types.js';
import { parseJson } from './utils/parse-json.js';

const runErrorMarker = 'vercel.ai.error.RunError';
const runErrorSymbol = Symbol.for(runErrorMarker);

export const MAX_SERIALIZED_ERROR_BYTES = 64 * 1024;
const MAX_ERROR_NAME_BYTES = 256;
const MAX_ERROR_MESSAGE_BYTES = 16 * 1024;
const MAX_ERROR_STACK_BYTES = 32 * 1024;
const MAX_ERROR_CODE_BYTES = 256;
const MAX_ERROR_DETAILS_BYTES = 16 * 1024;

/**
 * Base class for errors raised by JavaScript runtime.
 *
 * All package-specific errors include a stable `code` string and may include
 * structured `details` for diagnostics.
 */
export class RunError extends Error {
  private readonly [runErrorSymbol] = true;

  /**
   * Stable machine-readable error code.
   */
  code: string;
  /**
   * Optional structured diagnostic details.
   */
  readonly details?: unknown;

  constructor(message: string, code = 'RUN_ERROR', details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
  }

  /** Identifies `RunError` instances across duplicate package copies. */
  static isInstance(error: unknown): error is RunError {
    return (
      error !== null &&
      typeof error === 'object' &&
      runErrorSymbol in error &&
      (error as Record<symbol, unknown>)[runErrorSymbol] === true
    );
  }
}

/**
 * Raised when a sandbox invocation exceeds its timeout.
 */
export class RunTimeoutError extends RunError {
  constructor(timeoutMs: number) {
    super(
      `JavaScript runtime execution timed out after ${timeoutMs}ms.`,
      'RUN_TIMEOUT',
      { timeoutMs },
    );
  }
}

/**
 * Raised when the caller's abort signal aborts a run invocation.
 */
export class RunAbortedError extends RunError {
  constructor() {
    super('JavaScript runtime execution was aborted.', 'RUN_ABORTED');
  }
}

/**
 * Raised when the process-global worker cap has been reached.
 *
 * Configure the cap with `setMaxWorkers`.
 */
export class RunConcurrencyError extends RunError {
  constructor(maxWorkers: number) {
    super(
      `JavaScript runtime maxWorkers limit reached (${maxWorkers}).`,
      'RUN_CONCURRENCY_LIMIT',
      { maxWorkers },
    );
  }
}

/**
 * Raised when the provided source exceeds `limits.maxSourceBytes`.
 */
export class RunSourceTooLargeError extends RunError {
  constructor(bytes: number, maxBytes: number) {
    super(
      `JavaScript runtime source exceeds the ${maxBytes} byte size limit.`,
      'RUN_SOURCE_TOO_LARGE',
      { bytes, maxBytes },
    );
  }
}

/**
 * Raised when sandboxed code exceeds bridge request limits.
 */
export class RunBridgeLimitError extends RunError {
  constructor(message: string, details?: unknown) {
    super(message, 'RUN_BRIDGE_LIMIT', details);
  }
}

/**
 * Raised when sandboxed code starts host bridge work and returns without
 * awaiting or otherwise observing it.
 */
export class RunDetachedBridgeRequestError extends RunError {
  constructor(message: string, details?: unknown) {
    super(message, 'RUN_DETACHED_BRIDGE_REQUEST', details);
  }
}

/**
 * Raised when the main thread and worker protocol observes an invalid or
 * mismatched message.
 */
export class RunProtocolError extends RunError {
  constructor(message: string, details?: unknown) {
    super(message, 'RUN_PROTOCOL_ERROR', details);
  }
}

/**
 * Base class for failures caused by nested host binding execution.
 */
export class RunBindingError extends RunError {
  constructor(message: string, details?: unknown) {
    super(message, 'RUN_BINDING_ERROR', details);
  }
}

/**
 * Converts an unknown thrown value into a worker-safe serializable shape.
 *
 * @internal
 */
export function serializeError(error: unknown): SerializableError {
  if (RunError.isInstance(error)) {
    const result = compactError({
      name: boundedString(error.name, MAX_ERROR_NAME_BYTES, 'RunError'),
      message: boundedString(
        error.message,
        MAX_ERROR_MESSAGE_BYTES,
        'JavaScript runtime failed.',
      ),
      code: boundedString(error.code, MAX_ERROR_CODE_BYTES, 'RUN_ERROR'),
    });
    const stack = safeErrorProperty(error, 'stack');
    if (typeof stack === 'string') {
      result.stack = sanitizeStack(stack);
    }
    const details = sanitizeDetails(safeErrorProperty(error, 'details'));
    if (details !== undefined) {
      result.details = details;
    }
    return enforceSerializedErrorLimit(result);
  }

  if (error instanceof Error) {
    const result = compactError({
      name: boundedString(error.name, MAX_ERROR_NAME_BYTES, 'Error'),
      message: boundedString(
        error.message,
        MAX_ERROR_MESSAGE_BYTES,
        'JavaScript runtime failed.',
      ),
    });
    const stack = safeErrorProperty(error, 'stack');
    if (typeof stack === 'string') {
      result.stack = sanitizeStack(stack);
    }
    const code = safeErrorProperty(error, 'code');
    if (typeof code === 'string') {
      result.code = boundedString(code, MAX_ERROR_CODE_BYTES, 'RUN_ERROR');
    }
    const details = sanitizeDetails(safeErrorProperty(error, 'details'));
    if (details !== undefined) {
      result.details = details;
    }
    return enforceSerializedErrorLimit(result);
  }

  return enforceSerializedErrorLimit({
    name: 'Error',
    message: boundedString(
      safeToString(error),
      MAX_ERROR_MESSAGE_BYTES,
      'JavaScript runtime failed.',
    ),
  });
}

/**
 * Converts host bridge failures into a sandbox-visible sanitized shape.
 *
 * This intentionally omits stack traces and diagnostic details. Full host
 * diagnostics remain on the host side.
 *
 * @internal
 */
export function serializeBridgeErrorForGuest(
  error: unknown,
  context: 'binding' | 'bridge',
): SerializableError {
  if (RunError.isInstance(error)) {
    return compactError({
      name: boundedString(error.name, MAX_ERROR_NAME_BYTES, 'RunError'),
      message: boundedString(
        error.message,
        MAX_ERROR_MESSAGE_BYTES,
        'Host binding failed.',
      ),
      code: boundedString(error.code, MAX_ERROR_CODE_BYTES, 'RUN_ERROR'),
    });
  }

  const fallback =
    context === 'binding'
      ? {
          message: 'Host binding failed.',
          code: 'RUN_HOST_BINDING_ERROR',
        }
      : {
          message: 'Host bridge request failed.',
          code: 'RUN_HOST_BRIDGE_ERROR',
        };

  return {
    name: 'Error',
    message: fallback.message,
    code: fallback.code,
  };
}

function compactError(error: {
  name: string;
  message: string;
  stack?: string;
  code?: string;
  details?: unknown;
}): SerializableError {
  return {
    name: error.name,
    message: error.message,
    ...(error.stack !== undefined ? { stack: error.stack } : {}),
    ...(error.code !== undefined ? { code: error.code } : {}),
    ...(error.details !== undefined ? { details: error.details } : {}),
  };
}

/**
 * Rehydrates a serialized worker error into an Error instance.
 *
 * @internal
 */
export function deserializeError(error: SerializableError): Error {
  if (error.code === 'RUN_TIMEOUT') {
    const details = error.details as { timeoutMs?: number } | undefined;
    const result = new RunTimeoutError(details?.timeoutMs ?? 0);
    restoreStack(result, error);
    return result;
  }

  if (error.code === 'RUN_ABORTED') {
    const result = new RunAbortedError();
    restoreStack(result, error);
    return result;
  }

  if (error.code === 'RUN_SOURCE_TOO_LARGE') {
    const details = error.details as
      | { bytes?: number; maxBytes?: number }
      | undefined;
    const result = new RunSourceTooLargeError(
      details?.bytes ?? 0,
      details?.maxBytes ?? 0,
    );
    restoreStack(result, error);
    return result;
  }

  if (error.code === 'RUN_BRIDGE_LIMIT') {
    const result = new RunBridgeLimitError(error.message, error.details);
    restoreStack(result, error);
    return result;
  }

  if (error.code === 'RUN_DETACHED_BRIDGE_REQUEST') {
    const result = new RunDetachedBridgeRequestError(
      error.message,
      error.details,
    );
    restoreStack(result, error);
    return result;
  }

  if (error.code === 'RUN_PROTOCOL_ERROR') {
    const result = new RunProtocolError(error.message, error.details);
    restoreStack(result, error);
    return result;
  }

  const result = new RunError(
    error.message,
    error.code ?? 'RUN_ERROR',
    error.details,
  );
  result.name = error.name;
  restoreStack(result, error);
  return result;
}

function restoreStack(error: Error, serialized: SerializableError): void {
  if (serialized.stack) {
    error.stack = serialized.stack;
  }
}

function boundedString(
  value: string,
  maxBytes: number,
  fallback: string,
): string {
  if (typeof value !== 'string') return fallback;
  const bytes = Buffer.from(value);
  if (bytes.byteLength <= maxBytes) return value;
  const suffix = '…[truncated]';
  const suffixBytes = Buffer.byteLength(suffix);
  return `${bytes.subarray(0, Math.max(0, maxBytes - suffixBytes)).toString('utf8')}${suffix}`;
}

function sanitizeStack(value: string): string {
  return boundedString(
    value
      .replace(/data:text\/javascript;base64,[^\s)]+/gu, '<run-worker>')
      .replace(/file:\/\/\/[^\s)]+/gu, '<internal>'),
    MAX_ERROR_STACK_BYTES,
    '',
  );
}

function sanitizeDetails(value: unknown): unknown {
  if (value === undefined) return undefined;
  try {
    const encoded = JSON.stringify(value);
    if (
      encoded === undefined ||
      Buffer.byteLength(encoded) > MAX_ERROR_DETAILS_BYTES
    ) {
      return undefined;
    }
    return parseJson(encoded);
  } catch {
    return undefined;
  }
}

function safeErrorProperty(error: Error, property: string): unknown {
  try {
    return (error as unknown as Record<string, unknown>)[property];
  } catch {
    return undefined;
  }
}

function safeToString(value: unknown): string {
  try {
    return String(value);
  } catch {
    return 'JavaScript runtime failed.';
  }
}

function enforceSerializedErrorLimit(
  error: SerializableError,
): SerializableError {
  if (Buffer.byteLength(JSON.stringify(error)) <= MAX_SERIALIZED_ERROR_BYTES) {
    return error;
  }
  return {
    name: boundedString(error.name, MAX_ERROR_NAME_BYTES, 'Error'),
    message: boundedString(
      error.message,
      MAX_ERROR_MESSAGE_BYTES,
      'JavaScript runtime failed.',
    ),
    ...(error.code === undefined
      ? {}
      : { code: boundedString(error.code, MAX_ERROR_CODE_BYTES, 'RUN_ERROR') }),
  };
}
