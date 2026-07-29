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
}

/**
 * Input for `runCodeMode`.
 */
export interface RunCodeModeInput {
  js: string;
  tools: CodeModeToolSet;
  toolExecutionOptions?: Partial<CodeModeToolExecutionOptions>;
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
