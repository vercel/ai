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

export class CodeModeToolApprovalRequiredError extends CodeModeToolError {
  constructor(toolName: string, input: unknown, toolCallId: string) {
    super(`Tool "${toolName}" requires approval before execution.`, {
      toolName,
      input,
      toolCallId,
    });
    this.code = 'CODE_MODE_TOOL_APPROVAL_REQUIRED';
  }
}

export class CodeModeToolApprovalDeniedError extends CodeModeToolError {
  constructor(
    toolName: string,
    input: unknown,
    toolCallId: string,
    reason?: string,
  ) {
    super(
      `Tool "${toolName}" approval was denied${reason ? `: ${reason}` : '.'}`,
      {
        toolName,
        input,
        toolCallId,
        ...(reason !== undefined ? { reason } : {}),
      },
    );
    this.code = 'CODE_MODE_TOOL_APPROVAL_DENIED';
  }
}
