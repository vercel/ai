/**
 * A host function made available to sandboxed JavaScript.
 */
export type BindingFunction<
  ARGUMENTS extends unknown[] = unknown[],
  OUTPUT = unknown,
> = (...args: ARGUMENTS) => OUTPUT | Promise<OUTPUT>;

/**
 * Context supplied to each host binding invocation.
 */
export interface BindingContext {
  /** Signal aborted when the run is aborted, times out, or fails. */
  abortSignal: AbortSignal;
  /** Stable identifier for the current run attempt. */
  invocationId: string;
  /** Stable identifier for the logical run across every replay attempt. */
  logicalRunId: string;
  /** Stable identifier for this binding request within the run attempt. */
  requestId: string;
  /** One-based request order within the run attempt. */
  requestIndex: number;
  /** Fully qualified binding path, for example `tools.search`. */
  bindingName: string;
  /** Interrupts this binding and suspends the run. */
  interrupt(payload: unknown): never;
  /** Present when an interrupted binding is reinvoked during replay. */
  resume?: BindingResumeContext;
}

export interface BindingResumeContext {
  interruptionId: string;
  payload: unknown;
  resolution: unknown;
}

/** A named collection of host functions. */
export type BindingGroup = Record<string, BindingFunction<any, any>>;

/**
 * Host function groups installed as guest globals.
 *
 * A group named `tools` containing `search` is called as `tools.search()` in
 * sandboxed code.
 */
export type Bindings = Record<string, BindingGroup>;

/** Resource limits applied to one sandbox invocation. */
export interface RunLimits {
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
  maxBindingArgumentsBytes?: number;
  /** @defaultValue `4 * 1024 * 1024` */
  maxBindingOutputBytes?: number;
  /** @defaultValue `256` */
  maxBridgeRequests?: number;
  /** @defaultValue `32` */
  maxInFlightBridgeRequests?: number;
  /** @defaultValue `32 * 1024 * 1024` */
  maxContinuationBytes?: number;
}

/** Shared defaults used by a runner. */
export interface RunnerOptions<TOKEN = string> {
  limits?: RunLimits;
  /** HMAC key used for signed continuations. Cannot be combined with continuationCodec. */
  continuationSecret?: string | Uint8Array;
  continuationCodec?: ContinuationCodec<TOKEN>;
  /** Authenticated application/endpoint audience for every continuation. */
  continuationAudience?: string;
}

/** Input accepted by `run` and `Runner.run`. */
export interface RunInput<TOKEN = unknown> {
  /**
   * JavaScript or type-stripped TypeScript function-body source.
   * Top-level `await` and `return` are supported.
   */
  source: string;
  bindings?: Bindings;
  abortSignal?: AbortSignal;
  limits?: RunLimits;
  continuation?: TOKEN;
  resolutions?: RunResolution[];
  /**
   * Serializable tenant, principal, or policy context authenticated by a
   * continuation and required unchanged when it is resumed.
   */
  continuationContext?: unknown;
}

/** Result of a completed sandbox invocation. */
export interface RunCompletedResult<OUTPUT = unknown> {
  status: 'completed';
  value: OUTPUT;
}

export interface RunInterruption<PAYLOAD = unknown> {
  id: string;
  bindingName: string;
  /** Complete guest argument list for the interrupted binding call. */
  arguments: unknown[];
  payload: PAYLOAD;
}

export interface RunInterruptedResult<TOKEN = unknown> {
  status: 'interrupted';
  interruptions: RunInterruption[];
  /** Opaque bearer capability. Persist it without modifying it. */
  continuation: TOKEN;
}

export interface RunResolution<VALUE = unknown> {
  interruptionId: string;
  value: VALUE;
}

/**
 * Result of a sandbox invocation.
 */
export type RunResult<OUTPUT = unknown, TOKEN = unknown> =
  | RunCompletedResult<OUTPUT>
  | RunInterruptedResult<TOKEN>;

export interface ContinuationCodec<TOKEN = unknown> {
  encode(
    state: RunContinuationState,
    context?: ContinuationOperationContext,
  ): TOKEN | Promise<TOKEN>;
  decode(
    token: TOKEN,
    context?: ContinuationOperationContext,
  ): RunContinuationState | Promise<RunContinuationState>;
}

export interface ContinuationOperationContext {
  abortSignal: AbortSignal;
  deadlineMs: number;
}

/** Serializable replay state passed to a configured continuation codec. */
export interface RunContinuationState {
  version: 2;
  runtime: 'run-replay-v2';
  serde: 'run-js-v1';
  source: string;
  logicalRunId: string;
  scopeHash: string;
  determinism: RunDeterminismState;
  ledger: RunLedgerEntry[];
}

export interface RunDeterminismState {
  /** Initial Unix timestamp used by deterministic guest date APIs. */
  dateNowMs: number;
  /** 128-bit seed used by deterministic guest `Math.random()`. */
  randomSeed: string;
}

export type RunLedgerEntry =
  | {
      bindingName: string;
      inputJson: string;
      status: 'fulfilled';
      settledOrder: number;
      dateNowMs: number;
      valueJson: string;
    }
  | {
      bindingName: string;
      inputJson: string;
      status: 'rejected';
      settledOrder: number;
      dateNowMs: number;
      error: SerializableError;
    }
  | {
      bindingName: string;
      inputJson: string;
      status: 'interrupted';
      interruptionId: string;
      payloadJson: string;
    };

/** Configured JavaScript runner. */
export interface Runner<TOKEN = unknown> {
  run<OUTPUT = unknown>(
    input: RunInput<TOKEN>,
  ): Promise<RunResult<OUTPUT, TOKEN>>;
}

/** @internal */
export interface InternalRunInput extends RunInput<unknown> {
  bindings: Bindings;
  limits: RunLimits;
  continuationCodec: ContinuationCodec;
  continuationAudience: string;
}

/** @internal */
export interface NormalizedRunOptions {
  timeoutMs: number;
  memoryLimitBytes: number;
  maxStackSizeBytes: number;
  maxResultBytes: number;
  maxConsoleOutputBytes: number;
  maxSourceBytes: number;
  maxBindingInputBytes: number;
  maxBindingOutputBytes: number;
  maxBridgeRequests: number;
  maxInFlightBridgeRequests: number;
  maxContinuationBytes: number;
}

/** @internal */
export interface SerializableError {
  name: string;
  message: string;
  stack?: string;
  code?: string;
  details?: unknown;
}
