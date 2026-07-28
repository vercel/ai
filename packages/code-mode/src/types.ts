import type { ModelMessage, Tool } from 'ai';

/**
 * Host tools made available to sandboxed code through the global `tools` object.
 *
 * Each key becomes a callable async function at `tools[key](input)`.
 */
export type CodeModeToolSet = Record<string, Tool<any, any>>;

/**
 * Tool execution metadata forwarded to nested host tool calls.
 *
 * AI SDK 6 uses `experimental_context`; AI SDK 7 beta uses `context`. Code mode
 * accepts both and forwards both when either one is provided.
 */
export interface CodeModeToolExecutionOptions {
  /**
   * AI SDK tool call id for the outer code-mode invocation.
   */
  toolCallId: string;
  /**
   * Model messages that led to the outer code-mode invocation.
   */
  messages: ModelMessage[];
  /**
   * Abort signal for the outer code-mode invocation.
   */
  abortSignal?: AbortSignal;
  /**
   * AI SDK 6 experimental context.
   */
  experimental_context?: unknown;
  /**
   * AI SDK 7 beta tool context.
   */
  context?: unknown;
  /**
   * Generic code-mode interruption context for a host tool that is being
   * re-executed during continuation.
   */
  codeModeInterrupt?: CodeModeInterruptExecutionContext;
}

/**
 * AI SDK tool returned by `createCodeModeTool`.
 *
 * Code mode always has a static generated description and accepts the
 * cross-version execution options used by its nested tool bridge.
 */
export type CodeModeTool = Tool<CodeModeToolInput, unknown> & {
  description: string;
};

/**
 * Input schema for the generated code-mode AI SDK tool.
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

/**
 * Result returned by an approval callback.
 */
export type ApprovalDecision =
  | 'approved'
  | 'denied'
  | { approved: boolean; reason?: string };

/**
 * Approval request passed to `approval.onApprovalRequired`.
 */
export interface CodeModeApprovalRequest {
  /**
   * Name of the host tool being requested.
   */
  toolName: string;
  /**
   * Validated tool input requested by sandboxed code.
   */
  input: unknown;
  /**
   * Tool call id derived from the outer AI SDK tool call id.
   */
  toolCallId: string;
}

/**
 * Approval response used to continue a code-mode invocation that previously
 * interrupted for a nested host tool approval.
 */
export interface CodeModeApprovalResponse {
  /**
   * Approval id from the `CodeModeApprovalInterrupt`. This is the interrupt id
   * of the underlying generic interruption.
   */
  approvalId: string;
  /**
   * Whether the nested tool call was approved.
   */
  approved: boolean;
  /**
   * Optional reason for approval or denial.
   */
  reason?: string;
}

/**
 * Interrupt resolution applied to a built-in nested tool approval interruption.
 *
 * A `CodeModeApprovalInterrupt` is a `CodeModeInterrupt` whose payload kind is
 * the reserved approval kind. Resuming it with `continueCodeModeInterrupt`
 * requires a resolution of this shape; `continueCodeModeApproval` builds it from
 * a `CodeModeApprovalResponse`.
 */
export interface CodeModeApprovalResolution {
  /**
   * Whether the nested tool call was approved.
   */
  approved: boolean;
  /**
   * Optional reason for approval or denial.
   */
  reason?: string;
}

/**
 * JSON-serializable host interruption payload.
 */
export interface CodeModeInterruptPayload {
  /**
   * Stable interruption kind, such as `"connection-auth"`.
   */
  kind: string;
  [key: string]: unknown;
}

/**
 * Generic interruption resolution passed to the host tool during continuation.
 */
export interface CodeModeInterruptResolution<TResolution = unknown> {
  /**
   * Interruption id from the pending code-mode interruption.
   */
  interruptId: string;
  /**
   * Host-provided resolution for the interruption.
   */
  resolution: TResolution;
}

/**
 * Interruption context forwarded to the nested host tool when a continuation
 * resumes the tool call that originally interrupted.
 */
export interface CodeModeInterruptExecutionContext<
  TPayload extends CodeModeInterruptPayload = CodeModeInterruptPayload,
  TResolution = unknown,
> {
  /**
   * Interruption id being resolved.
   */
  interruptId: string;
  /**
   * Original interruption payload.
   */
  payload: TPayload;
  /**
   * Host-provided resolution.
   */
  resolution: TResolution;
}

/**
 * Serializable record of one completed or interrupted sandbox-to-host bridge
 * request. Continuations replay this ledger so previously completed bridge
 * calls are not repeated.
 */
export type CodeModeContinuationLedgerEntry =
  | {
      kind: 'tool';
      name: string;
      inputJson: string;
      toolCallId: string;
      status: 'fulfilled';
      dateNowMs: number;
      valueJson: string;
    }
  | {
      kind: 'tool';
      name: string;
      inputJson: string;
      toolCallId: string;
      status: 'rejected';
      dateNowMs: number;
      error: SerializableError;
    }
  | {
      kind: 'tool';
      name: string;
      inputJson: string;
      toolCallId: string;
      interruptId: string;
      interruptPayload: CodeModeInterruptPayload;
      status: 'interrupted';
    }
  | {
      kind: 'fetch';
      name: string;
      inputJson: string;
      status: 'fulfilled';
      dateNowMs: number;
      valueJson: string;
    }
  | {
      kind: 'fetch';
      name: string;
      inputJson: string;
      status: 'rejected';
      dateNowMs: number;
      error: SerializableError;
    };

/**
 * Deterministic guest API state used when replaying an interrupted invocation.
 *
 * Code mode uses this state to make no-argument `Date`, `Date.now()`, and
 * `Math.random()` deterministic across approval continuations.
 */
export interface CodeModeDeterminismState {
  /**
   * Initial timestamp, in Unix epoch milliseconds, for deterministic date APIs.
   */
  dateNowMs: number;
  /**
   * Initial 128-bit seed for deterministic `Math.random()`, encoded as 32
   * hexadecimal characters.
   */
  randomSeed: string;
}

/**
 * Host-authenticated bearer capability metadata for an interrupted invocation.
 */
export interface CodeModeContinuationAuth {
  /**
   * Signature algorithm.
   */
  alg: 'HMAC-SHA256';
  /**
   * Random nonce generated when the continuation was issued.
   */
  nonce: string;
  /**
   * Issuance time in Unix epoch milliseconds.
   */
  issuedAtMs: number;
  /**
   * Expiration time in Unix epoch milliseconds.
   */
  expiresAtMs: number;
  /**
   * HMAC over the canonical continuation payload, excluding this field.
   */
  signature: string;
}

/**
 * Opaque continuation state for a code-mode invocation interrupted by nested
 * tool approval.
 */
export interface CodeModeContinuation {
  version: 1;
  js: string;
  outerToolCallId: string;
  determinism: CodeModeDeterminismState;
  ledger: CodeModeContinuationLedgerEntry[];
  auth: CodeModeContinuationAuth;
}

/**
 * Continuation payload before the host signs it.
 *
 * @internal
 */
export type UnsignedCodeModeContinuation = Omit<CodeModeContinuation, 'auth'>;

/**
 * Result produced when a nested host tool triggers a generic interruption.
 *
 * The whole value is JSON-serializable: persist it in session state and pass it
 * back to `continueCodeModeInterrupt` to resume. Every field except
 * `continuation` is convenience metadata describing the paused nested call.
 * `continuation` is the opaque, host-signed replay capability and the only
 * authenticated part of the interruption.
 */
export interface CodeModeInterrupt<
  TPayload extends CodeModeInterruptPayload = CodeModeInterruptPayload,
> {
  type: 'code-mode-interrupt';
  /**
   * Stable id for this interruption, equal to `<toolCallId>:interrupt`. Pass it
   * back as `CodeModeInterruptResolution.interruptId` when resuming.
   */
  interruptId: string;
  /**
   * Name of the nested host tool that interrupted.
   */
  toolName: string;
  /**
   * Derived tool call id of the interrupted nested call.
   */
  toolCallId: string;
  /**
   * AI SDK tool call id of the outer `code_mode` invocation.
   */
  outerToolCallId: string;
  /**
   * Input the nested host tool was called with.
   */
  input: unknown;
  /**
   * Interruption payload. `payload.kind` identifies the interruption type.
   */
  payload: TPayload;
  /**
   * Opaque, host-signed replay capability. Treat it as an opaque token.
   */
  continuation: CodeModeContinuation;
}

/**
 * Normalized result returned by `unwrapCodeModeResult`.
 */
export type CodeModeUnwrappedResult =
  | {
      status: 'completed';
      output: unknown;
    }
  | {
      status: 'interrupted';
      interrupt: CodeModeInterrupt;
    };

/**
 * Reserved interruption payload for a built-in nested tool approval.
 *
 * Approval is implemented as a generic code-mode interruption with this payload
 * kind, so every `CodeModeApprovalInterrupt` is also a `CodeModeInterrupt`.
 */
export interface CodeModeApprovalInterruptPayload extends CodeModeInterruptPayload {
  kind: 'ai-sdk-code-mode/tool-approval';
}

/**
 * Interruption produced when code mode is configured to interrupt for nested
 * tool approvals and sandboxed code requests an approval-required host tool.
 *
 * This is a `CodeModeInterrupt` whose payload kind is the reserved approval
 * kind. The approval-specific helpers project the inner tool name, input, and
 * approval id (the interrupt id) from it and adapt it to AI SDK approval
 * messages.
 */
export type CodeModeApprovalInterrupt =
  CodeModeInterrupt<CodeModeApprovalInterruptPayload>;

/**
 * Summary of one nested host bridge request.
 */
export type CodeModeTraceEntry =
  | {
      kind: 'tool';
      bridgeIndex: number;
      toolName: string;
      toolCallId: string;
      status: 'fulfilled' | 'rejected' | 'interrupted';
      replayed: boolean;
      startedAtMs: number;
      completedAtMs: number;
      durationMs: number;
      inputBytes: number;
      outputBytes?: number;
      error?: SerializableError;
      interruptType?: CodeModeInterrupt['type'];
    }
  | {
      kind: 'fetch';
      bridgeIndex: number;
      url: string;
      method: string;
      status: 'fulfilled' | 'rejected';
      replayed: boolean;
      startedAtMs: number;
      completedAtMs: number;
      durationMs: number;
      inputBytes: number;
      outputBytes?: number;
      error?: SerializableError;
    };

/**
 * Per-invocation trace that summarizes nested tool and fetch activity.
 */
export interface CodeModeTrace {
  invocationId: string;
  outerToolCallId: string;
  status: 'completed' | 'failed' | 'interrupted';
  startedAtMs: number;
  completedAtMs: number;
  durationMs: number;
  bridgeRequests: CodeModeTraceEntry[];
  interruptedBy?: CodeModeInterrupt['type'];
  error?: SerializableError;
}

/**
 * Compact nested bridge summary that can optionally be included in the
 * model-visible `code_mode` output.
 */
export type CodeModeModelVisibleBridgeSummary =
  | {
      kind: 'tool';
      toolName: string;
      toolCallId: string;
      status: CodeModeTraceEntry['status'];
      replayed: boolean;
      /**
       * AI SDK ToolResultOutput for the nested tool result. Present only when
       * `modelOutput.includeNestedToolOutputs` is enabled and the nested tool
       * fulfilled.
       */
      output?: unknown;
    }
  | {
      kind: 'fetch';
      url: string;
      method: string;
      status: 'fulfilled' | 'rejected';
      replayed: boolean;
    };

/**
 * Optional model-visible wrapper used by `createCodeModeTool`.
 */
export interface CodeModeModelOutputOptions {
  /**
   * Include a compact list of nested tool calls in the outer `code_mode`
   * result. Inputs are never included. Outputs are included only when
   * `includeNestedToolOutputs` is enabled.
   *
   * @defaultValue `false`
   */
  includeNestedToolSummary?: boolean;
  /**
   * Include AI SDK model-visible outputs for fulfilled nested tool calls.
   *
   * When a nested tool defines `toModelOutput`, that mapper is used. Otherwise
   * code mode uses AI SDK's default text/json tool-output mapping. This option
   * implies `includeNestedToolSummary`.
   *
   * @defaultValue `false`
   */
  includeNestedToolOutputs?: boolean;
  /**
   * Include sandbox fetch calls in the compact bridge summary.
   *
   * @defaultValue `false`
   */
  includeFetchSummary?: boolean;
  /**
   * Maximum bridge summary entries included in the model-visible output.
   *
   * @defaultValue `32`
   */
  maxSummaryEntries?: number;
}

/**
 * Output shape returned by `createCodeModeTool` when model-visible bridge
 * summaries are enabled.
 */
export interface CodeModeModelOutput {
  result: unknown;
  nestedTools: CodeModeModelVisibleBridgeSummary[];
}

/**
 * OpenTelemetry-compatible settings for code-mode spans.
 */
export interface CodeModeTelemetryOptions {
  /**
   * Enables code-mode telemetry spans.
   *
   * @defaultValue `false`
   */
  isEnabled?: boolean;
  /**
   * Custom OpenTelemetry tracer.
   */
  tracer?: unknown;
  /**
   * Whether span attributes may include input sizes and source size.
   *
   * Raw inputs and source are never recorded by code mode.
   *
   * @defaultValue `true`
   */
  recordInputs?: boolean;
  /**
   * Whether span attributes may include output sizes.
   *
   * Raw outputs are never recorded by code mode.
   *
   * @defaultValue `true`
   */
  recordOutputs?: boolean;
  /**
   * Function identifier attached to code-mode spans.
   */
  functionId?: string;
  /**
   * Additional attributes attached to code-mode spans.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Event emitted before a nested host tool is executed.
 */
export interface CodeModeNestedToolCallEvent {
  invocationId: string;
  outerToolCallId: string;
  bridgeIndex: number;
  toolName: string;
  input: unknown;
  inputBytes: number;
  toolCallId: string;
  replayed: boolean;
  startedAtMs: number;
}

/**
 * Event emitted after a nested host tool produces a sandbox-visible result.
 */
export type CodeModeNestedToolResultEvent =
  | (CodeModeNestedToolCallEvent & {
      status: 'fulfilled';
      completedAtMs: number;
      durationMs: number;
      outputBytes: number;
      output: unknown;
    })
  | (CodeModeNestedToolCallEvent & {
      status: 'rejected';
      completedAtMs: number;
      durationMs: number;
      error: unknown;
    })
  | (CodeModeNestedToolCallEvent & {
      status: 'interrupted';
      completedAtMs: number;
      durationMs: number;
      interrupt: CodeModeInterrupt;
    });

/**
 * Event emitted before a sandbox `fetch` request is handled by the host.
 */
export interface CodeModeFetchRequestEvent {
  invocationId: string;
  outerToolCallId: string;
  bridgeIndex: number;
  url: string;
  method: string;
  inputBytes: number;
  replayed: boolean;
  startedAtMs: number;
}

/**
 * Event emitted after a sandbox `fetch` request resolves or rejects.
 */
export type CodeModeFetchResultEvent =
  | (CodeModeFetchRequestEvent & {
      status: 'fulfilled';
      completedAtMs: number;
      durationMs: number;
      outputBytes: number;
    })
  | (CodeModeFetchRequestEvent & {
      status: 'rejected';
      completedAtMs: number;
      durationMs: number;
      error: unknown;
    });

/**
 * Event emitted when code mode returns an interruption.
 */
export interface CodeModeInterruptEvent {
  invocationId: string;
  outerToolCallId: string;
  interrupt: CodeModeInterrupt;
}

/**
 * Lifecycle hook failure event.
 */
export interface CodeModeLifecycleHookErrorEvent {
  hook:
    | 'onNestedToolCall'
    | 'onNestedToolResult'
    | 'onFetchRequest'
    | 'onFetchResult'
    | 'onInterrupt'
    | 'onTrace';
  event:
    | CodeModeNestedToolCallEvent
    | CodeModeNestedToolResultEvent
    | CodeModeFetchRequestEvent
    | CodeModeFetchResultEvent
    | CodeModeInterruptEvent
    | CodeModeTrace;
}

/**
 * Policy for enabling and restricting `fetch` inside the sandbox.
 *
 * `fetch` is disabled unless `CodeModeOptions.fetchPolicy` is provided. When a
 * policy is present, every requested URL, redirect URL, method, and response
 * body must satisfy this policy before data enters the sandbox.
 */
export interface CodeModeFetchPolicy {
  /**
   * Host fetch implementation to use.
   *
   * Defaults to `globalThis.fetch` when available.
   */
  fetch?: typeof globalThis.fetch;
  /**
   * Exact origins that sandboxed code may fetch.
   *
   * Example: `["https://api.example.com"]`.
   */
  allowedOrigins?: string[];
  /**
   * Origin plus path prefixes that sandboxed code may fetch.
   *
   * Prefixes must not include query strings or fragments.
   */
  allowedUrlPrefixes?: string[];
  /**
   * HTTP methods allowed by the fetch policy.
   *
   * @defaultValue `["GET", "HEAD"]`
   */
  allowedMethods?: string[];
  /**
   * Maximum response body size in bytes.
   *
   * @defaultValue `1024 * 1024`
   */
  maxResponseBytes?: number;
  /**
   * Whether redirects should be followed by the host.
   *
   * Redirect targets are checked against the same fetch policy.
   *
   * @defaultValue `false`
   */
  allowRedirects?: boolean;
  /**
   * Maximum number of redirects to follow when redirects are enabled.
   *
   * @defaultValue `10`
   */
  maxRedirects?: number;
}

/**
 * Execution limits applied to each sandbox invocation.
 */
export interface CodeModeExecutionPolicy {
  /**
   * Wall-clock timeout for one invocation, in milliseconds.
   *
   * @defaultValue `30_000`
   */
  timeoutMs?: number;
  /**
   * QuickJS runtime memory limit, in bytes.
   *
   * @defaultValue `64 * 1024 * 1024`
   */
  memoryLimitBytes?: number;
  /**
   * QuickJS stack limit, in bytes.
   *
   * @defaultValue `2 * 1024 * 1024`
   */
  maxStackSizeBytes?: number;
  /**
   * Maximum serialized sandbox result size, in bytes.
   *
   * @defaultValue `1024 * 1024`
   */
  maxResultBytes?: number;
  /**
   * Maximum input source size, in bytes.
   *
   * @defaultValue `256 * 1024`
   */
  maxSourceBytes?: number;
  /**
   * Maximum serialized input size for one host tool call, in bytes.
   *
   * @defaultValue `1024 * 1024`
   */
  maxToolInputBytes?: number;
  /**
   * Maximum serialized output size for one host tool call, in bytes.
   *
   * @defaultValue `4 * 1024 * 1024`
   */
  maxToolOutputBytes?: number;
  /**
   * Maximum total host bridge requests per invocation.
   *
   * Host bridge requests include tool calls and fetch calls.
   *
   * @defaultValue `256`
   */
  maxBridgeRequests?: number;
  /**
   * Maximum in-flight host bridge requests per invocation.
   *
   * @defaultValue `32`
   */
  maxInFlightBridgeRequests?: number;
}

/**
 * Host authentication policy for code-mode continuation capabilities.
 */
export interface CodeModeContinuationSecurityOptions {
  /**
   * Secret used to sign and verify continuations for this invocation.
   *
   * Configure the same secret when creating, inspecting, and resuming a
   * continuation across processes. When omitted, the process-global key is
   * used.
   */
  signingKey?: string | Uint8Array;
  /**
   * Lifetime of newly created continuations, in milliseconds.
   *
   * @defaultValue `60 * 60 * 1000`
   */
  maxAgeMs?: number;
}

/**
 * Options used by `createCodeModeTool` and `runCodeMode`.
 */
export interface CodeModeOptions {
  /**
   * Per-invocation execution limits.
   */
  executionPolicy?: CodeModeExecutionPolicy;
  /**
   * Per-invocation continuation signing and expiration policy.
   *
   * This avoids changing process-global signing state when a host serves
   * concurrent durable sessions with different secrets.
   */
  continuationSecurity?: CodeModeContinuationSecurityOptions;
  /**
   * Fetch policy for sandboxed `fetch`.
   *
   * Omit this or set it to `false` to keep `fetch` unavailable in the sandbox.
   */
  fetchPolicy?: false | CodeModeFetchPolicy;
  /**
   * Approval hooks for host tools that require approval.
   */
  approval?: {
    /**
     * Approval handling mode.
     *
     * - `callback`: use `onApprovalRequired` and fail when no callback approves.
     * - `interrupt`: return a `CodeModeApprovalInterrupt` continuation instead
     *   of executing or failing the nested tool call.
     *
     * @defaultValue `"callback"`
     */
    mode?: 'callback' | 'interrupt';
    /**
     * Called when sandboxed code requests a host tool that requires approval.
     *
     * Ignored when `mode` is `"interrupt"`.
     */
    onApprovalRequired?: (
      request: CodeModeApprovalRequest,
    ) => Promise<ApprovalDecision> | ApprovalDecision;
  };
  /**
   * Optional observability hooks for nested host tool activity.
   *
   * Hook errors are reported to `onHookError` when provided and otherwise
   * ignored so telemetry cannot change sandbox behavior.
   */
  lifecycle?: {
    onNestedToolCall?: (
      event: CodeModeNestedToolCallEvent,
    ) => Promise<void> | void;
    onNestedToolResult?: (
      event: CodeModeNestedToolResultEvent,
    ) => Promise<void> | void;
    onFetchRequest?: (event: CodeModeFetchRequestEvent) => Promise<void> | void;
    onFetchResult?: (event: CodeModeFetchResultEvent) => Promise<void> | void;
    onInterrupt?: (event: CodeModeInterruptEvent) => Promise<void> | void;
    onTrace?: (trace: CodeModeTrace) => Promise<void> | void;
    onHookError?: (
      error: unknown,
      event: CodeModeLifecycleHookErrorEvent,
    ) => Promise<void> | void;
  };
  /**
   * OpenTelemetry-compatible spans for code-mode execution.
   *
   * Disabled by default.
   */
  telemetry?: CodeModeTelemetryOptions;
  /**
   * Optional model-visible output wrapper for the generated AI SDK tool.
   *
   * Only `createCodeModeTool` uses this option. `runCodeMode` always returns
   * the sandbox output directly.
   */
  modelOutput?: CodeModeModelOutputOptions;
}

/**
 * Input for `runCodeMode`.
 */
export interface RunCodeModeInput {
  /**
   * JavaScript or type-stripped TypeScript source to execute.
   */
  js: string;
  /**
   * Host tools available to sandboxed code.
   */
  tools: CodeModeToolSet;
  /**
   * AI SDK tool execution options forwarded to nested host tool calls.
   */
  toolExecutionOptions?: Partial<CodeModeToolExecutionOptions>;
  /**
   * Code-mode runtime options.
   */
  options?: CodeModeOptions;
  /**
   * Continuation ledger from a previous `CodeModeInterrupt`.
   */
  continuation?: CodeModeContinuation;
  /**
   * Generic interruption resolution used with `continuation` to resume the
   * interrupted nested host tool call. Approval continuations pass a
   * `CodeModeApprovalResolution` here.
   */
  interruptResolution?: CodeModeInterruptResolution;
}

/**
 * Worker script location used by the process-global code-mode worker pool.
 *
 * URL strings such as values returned by `import.meta.resolve(...)` are accepted
 * and normalized to `URL` objects before spawning a Node.js worker.
 */
export type CodeModeWorkerUrl = string | URL;

/**
 * Fully normalized runtime options.
 *
 * @internal
 */
export interface NormalizedCodeModeOptions {
  timeoutMs: number;
  memoryLimitBytes: number;
  maxStackSizeBytes: number;
  maxResultBytes: number;
  maxSourceBytes: number;
  maxToolInputBytes: number;
  maxToolOutputBytes: number;
  maxBridgeRequests: number;
  maxInFlightBridgeRequests: number;
  fetch: typeof globalThis.fetch | undefined;
  fetchEnabled: boolean;
  fetchPolicy: Required<
    Pick<
      CodeModeFetchPolicy,
      'maxResponseBytes' | 'allowRedirects' | 'maxRedirects'
    >
  > &
    Omit<
      CodeModeFetchPolicy,
      'fetch' | 'maxResponseBytes' | 'allowRedirects' | 'maxRedirects'
    >;
}

/**
 * Serializable representation of an error crossing the worker boundary.
 *
 * @internal
 */
export interface SerializableError {
  name: string;
  message: string;
  stack?: string;
  code?: string;
  details?: unknown;
}
