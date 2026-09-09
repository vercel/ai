import type { ModelMessage, Tool } from 'ai';

/**
 * Host tools made available to sandboxed code through the global `tools` object.
 */
export type CodeModeToolSet = Record<string, Tool<any, any>>;

/**
 * AI SDK execution metadata forwarded to nested host tool calls.
 */
export interface CodeModeToolExecutionOptions {
  toolCallId: string;
  messages: ModelMessage[];
  abortSignal?: AbortSignal;
  experimental_context?: unknown;
  context?: unknown;
  codeModeInterrupt?: CodeModeInterruptExecutionContext;
}

/**
 * AI SDK tool returned by `createCodeModeTool`.
 */
export type CodeModeTool = Tool<CodeModeToolInput, unknown> & {
  description: string;
};

/**
 * Input accepted by the generated code-mode tool.
 */
export interface CodeModeToolInput {
  /**
   * JavaScript or type-stripped TypeScript source to execute.
   *
   * The source is wrapped in an async function, so top-level `await` and
   * `return` are supported.
   */
  js: string;
}

export type ApprovalDecision =
  | 'approved'
  | 'denied'
  | { approved: boolean; reason?: string };

export interface CodeModeApprovalRequest {
  toolName: string;
  input: unknown;
  toolCallId: string;
}

export interface CodeModeApprovalResponse {
  approvalId: string;
  approved: boolean;
  reason?: string;
}

export interface CodeModeApprovalResolution {
  approved: boolean;
  reason?: string;
}

export interface CodeModeInterruptPayload {
  kind: string;
  [key: string]: unknown;
}

export interface CodeModeInterruptResolution<TResolution = unknown> {
  interruptId: string;
  resolution: TResolution;
}

export interface CodeModeInterruptExecutionContext<
  TPayload extends CodeModeInterruptPayload = CodeModeInterruptPayload,
  TResolution = unknown,
> {
  interruptId: string;
  payload: TPayload;
  resolution: TResolution;
}

export interface CodeModeContinuationAuth {
  alg: 'HMAC-SHA256';
  nonce: string;
  issuedAtMs: number;
  expiresAtMs: number;
  signature: string;
}

/**
 * Opaque continuation state for an interrupted code-mode invocation.
 *
 * @remarks
 * The token and compatibility metadata are authenticated. Applications should
 * persist this value without reading or modifying its fields.
 */
export interface CodeModeContinuation {
  version: 2;
  js: string;
  outerToolCallId: string;
  toolNames: string[];
  token: string;
  pendingInterruptions: CodeModePendingInterruption[];
  resolutions: CodeModePendingResolution[];
  auth: CodeModeContinuationAuth;
}

export type UnsignedCodeModeContinuation = Omit<CodeModeContinuation, 'auth'>;

/**
 * Authenticated compatibility metadata for one interruption returned by
 * `run`.
 *
 * @internal
 */
export interface CodeModePendingInterruption {
  runInterruptionId: string;
  interruptId: string;
  toolName: string;
  toolCallId: string;
  input: unknown;
  payload: CodeModeInterruptPayload;
}

/**
 * A resolution collected while exposing a batched `run` interruption through
 * code mode's one-at-a-time continuation API.
 *
 * @internal
 */
export interface CodeModePendingResolution {
  runInterruptionId: string;
  value: unknown;
}

export interface CodeModeInterrupt<
  TPayload extends CodeModeInterruptPayload = CodeModeInterruptPayload,
> {
  type: 'code-mode-interrupt';
  interruptId: string;
  toolName: string;
  toolCallId: string;
  outerToolCallId: string;
  input: unknown;
  payload: TPayload;
  continuation: CodeModeContinuation;
}

export type CodeModeUnwrappedResult =
  | { status: 'completed'; output: unknown }
  | { status: 'interrupted'; interrupt: CodeModeInterrupt };

export interface CodeModeApprovalInterruptPayload extends CodeModeInterruptPayload {
  kind: 'ai-sdk-code-mode/tool-approval';
}

export type CodeModeApprovalInterrupt =
  CodeModeInterrupt<CodeModeApprovalInterruptPayload>;

/**
 * Execution limits applied to each sandbox invocation.
 */
export interface CodeModeExecutionPolicy {
  /** @defaultValue `30_000` */
  timeoutMs?: number;
  /** @defaultValue `64 * 1024 * 1024` */
  memoryLimitBytes?: number;
  /** @defaultValue `2 * 1024 * 1024` */
  maxStackSizeBytes?: number;
  /** @defaultValue `1024 * 1024` */
  maxResultBytes?: number;
  /** @defaultValue `64 * 1024` */
  maxConsoleOutputBytes?: number;
  /** @defaultValue `256 * 1024` */
  maxSourceBytes?: number;
  /** @defaultValue `1024 * 1024` */
  maxToolInputBytes?: number;
  /** @defaultValue `4 * 1024 * 1024` */
  maxToolOutputBytes?: number;
  /** @defaultValue `256` */
  maxBridgeRequests?: number;
  /** @defaultValue `32` */
  maxInFlightBridgeRequests?: number;
}

/**
 * Options used by `createCodeModeTool` and `runCodeMode`.
 */
export interface CodeModeOptions {
  executionPolicy?: CodeModeExecutionPolicy;
  continuationSecurity?: CodeModeContinuationSecurityOptions;
  approval?: {
    /**
     * @defaultValue `'callback'`
     */
    mode?: 'callback' | 'interrupt';
    onApprovalRequired?: (
      request: CodeModeApprovalRequest,
    ) => Promise<ApprovalDecision> | ApprovalDecision;
  };
}

export interface CodeModeContinuationSecurityOptions {
  signingKey?: string | Uint8Array;
  /**
   * @defaultValue `60 * 60 * 1000`
   */
  maxAgeMs?: number;
}

/**
 * Input for `runCodeMode`.
 */
export interface RunCodeModeInput {
  js: string;
  tools: CodeModeToolSet;
  toolExecutionOptions?: Partial<CodeModeToolExecutionOptions>;
  options?: CodeModeOptions;
  continuation?: CodeModeContinuation;
  interruptResolution?: CodeModeInterruptResolution;
}
