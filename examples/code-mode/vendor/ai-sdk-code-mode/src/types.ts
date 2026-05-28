import type { Tool, ToolExecutionOptions } from '@ai-sdk/provider-utils';

/**
 * Host tools made available to sandboxed code through the global `tools` object.
 *
 * Each key becomes a callable async function at `tools[key](input)`.
 */
export type CodeModeToolSet = Record<string, Tool<any, any, any>>;

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
 * Options used by `createCodeModeTool` and `runCodeMode`.
 */
export interface CodeModeOptions {
  /**
   * Per-invocation execution limits.
   */
  executionPolicy?: CodeModeExecutionPolicy;
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
     * Called when sandboxed code requests a host tool that requires approval.
     */
    onApprovalRequired?: (
      request: CodeModeApprovalRequest,
    ) => Promise<ApprovalDecision> | ApprovalDecision;
  };
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
  toolExecutionOptions?: Partial<ToolExecutionOptions<any>>;
  /**
   * Code-mode runtime options.
   */
  options?: CodeModeOptions;
}

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
