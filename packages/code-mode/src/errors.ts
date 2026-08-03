import type { SerializableError } from './types.js';

/**
 * Base class for errors raised by code mode.
 *
 * All package-specific errors include a stable `code` string and may include
 * structured `details` for diagnostics.
 */
export class CodeModeError extends Error {
  /**
   * Stable machine-readable error code.
   */
  code: string;
  /**
   * Optional structured diagnostic details.
   */
  readonly details?: unknown;

  constructor(message: string, code = 'CODE_MODE_ERROR', details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
  }
}

/**
 * Raised when a sandbox invocation exceeds its timeout.
 */
export class CodeModeTimeoutError extends CodeModeError {
  constructor(timeoutMs: number) {
    super(
      `Code mode execution timed out after ${timeoutMs}ms.`,
      'CODE_MODE_TIMEOUT',
      { timeoutMs },
    );
  }
}

/**
 * Raised when the outer AI SDK abort signal aborts a code-mode invocation.
 */
export class CodeModeAbortedError extends CodeModeError {
  constructor() {
    super('Code mode execution was aborted.', 'CODE_MODE_ABORTED');
  }
}

/**
 * Raised when the process-global worker cap has been reached.
 *
 * Configure the cap with `setMaxWorkers`.
 */
export class CodeModeConcurrencyError extends CodeModeError {
  constructor(maxWorkers: number) {
    super(
      `Code mode maxWorkers limit reached (${maxWorkers}).`,
      'CODE_MODE_CONCURRENCY_LIMIT',
      { maxWorkers },
    );
  }
}

/**
 * Raised when the provided source exceeds `executionPolicy.maxSourceBytes`.
 */
export class CodeModeSourceTooLargeError extends CodeModeError {
  constructor(bytes: number, maxBytes: number) {
    super(
      `Code mode source exceeds the ${maxBytes} byte size limit.`,
      'CODE_MODE_SOURCE_TOO_LARGE',
      { bytes, maxBytes },
    );
  }
}

/**
 * Raised when sandboxed code exceeds bridge request limits.
 */
export class CodeModeBridgeLimitError extends CodeModeError {
  constructor(message: string, details?: unknown) {
    super(message, 'CODE_MODE_BRIDGE_LIMIT', details);
  }
}

/**
 * Raised when sandboxed code starts host bridge work and returns without
 * awaiting or otherwise observing it.
 */
export class CodeModeDetachedBridgeRequestError extends CodeModeError {
  constructor(message: string, details?: unknown) {
    super(message, 'CODE_MODE_DETACHED_BRIDGE_REQUEST', details);
  }
}

/**
 * Raised when the main thread and worker protocol observes an invalid or
 * mismatched message.
 */
export class CodeModeProtocolError extends CodeModeError {
  constructor(message: string, details?: unknown) {
    super(message, 'CODE_MODE_PROTOCOL_ERROR', details);
  }
}

/**
 * Base class for failures caused by nested host tool execution.
 */
export class CodeModeToolError extends CodeModeError {
  constructor(message: string, details?: unknown) {
    super(message, 'CODE_MODE_TOOL_ERROR', details);
  }
}

/**
 * Converts an unknown thrown value into a worker-safe serializable shape.
 *
 * @internal
 */
export function serializeError(error: unknown): SerializableError {
  if (error instanceof CodeModeError) {
    const result = compactError({
      name: error.name,
      message: error.message,
      code: error.code,
    });
    if (error.stack !== undefined) {
      result.stack = error.stack;
    }
    if (error.details !== undefined) {
      result.details = error.details;
    }
    return result;
  }

  if (error instanceof Error) {
    const result = compactError({
      name: error.name,
      message: error.message,
    });
    if (error.stack !== undefined) {
      result.stack = error.stack;
    }
    const maybeCoded = error as Error & { code?: unknown; details?: unknown };
    if (typeof maybeCoded.code === 'string') {
      result.code = maybeCoded.code;
    }
    if (maybeCoded.details !== undefined) {
      result.details = maybeCoded.details;
    }
    return result;
  }

  return {
    name: 'Error',
    message: String(error),
  };
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
  context: 'tool' | 'bridge',
): SerializableError {
  if (error instanceof CodeModeError) {
    return compactError({
      name: error.name,
      message: error.message,
      code: error.code,
    });
  }

  const fallback =
    context === 'tool'
      ? {
          message: 'Host tool failed.',
          code: 'CODE_MODE_HOST_TOOL_ERROR',
        }
      : {
          message: 'Host bridge request failed.',
          code: 'CODE_MODE_HOST_BRIDGE_ERROR',
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
  if (error.code === 'CODE_MODE_SOURCE_TOO_LARGE') {
    const details = error.details as
      | { bytes?: number; maxBytes?: number }
      | undefined;
    const result = new CodeModeSourceTooLargeError(
      details?.bytes ?? 0,
      details?.maxBytes ?? 0,
    );
    restoreStack(result, error);
    return result;
  }

  if (error.code === 'CODE_MODE_BRIDGE_LIMIT') {
    const result = new CodeModeBridgeLimitError(error.message, error.details);
    restoreStack(result, error);
    return result;
  }

  if (error.code === 'CODE_MODE_DETACHED_BRIDGE_REQUEST') {
    const result = new CodeModeDetachedBridgeRequestError(
      error.message,
      error.details,
    );
    restoreStack(result, error);
    return result;
  }

  if (error.code === 'CODE_MODE_PROTOCOL_ERROR') {
    const result = new CodeModeProtocolError(error.message, error.details);
    restoreStack(result, error);
    return result;
  }

  const result = new CodeModeError(
    error.message,
    error.code ?? 'CODE_MODE_ERROR',
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
