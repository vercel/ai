import type { TelemetryConfig, TelemetryEventData } from './types';

type ALS<T> = {
  getStore(): T | undefined;
  run<R>(store: T, fn: () => R): R;
};

let traceStorage: ALS<TelemetryTrace> | undefined;

try {
  const { AsyncLocalStorage } = require('node:async_hooks');
  traceStorage = new AsyncLocalStorage();
} catch {
  // AsyncLocalStorage not available (e.g. some edge runtimes / browsers).
  // trace.run() will throw a helpful error; explicit passing still works.
}

/**
 * Returns the active trace from `AsyncLocalStorage`, if any.
 *
 * Used by `TelemetryEmitter` to resolve an ambient trace when no
 * explicit `telemetry` config is passed to an SDK function.
 *
 * @internal
 */
export function getActiveTrace(): TelemetryTrace | undefined {
  return traceStorage?.getStore();
}

/**
 * A trace groups multiple SDK calls under a single parent operation.
 */
export interface TelemetryTrace extends TelemetryConfig {
  /** Unique ID of the trace's root operation. */
  readonly traceId: string;

  /**
   * Run a function within this trace's context.
   *
   * Uses `AsyncLocalStorage` so any SDK call inside `fn` automatically
   * picks up this trace — no need to pass `telemetry` explicitly.
   *
   * The trace is automatically ended when `fn` completes (or throws).
   *
   * @throws if `AsyncLocalStorage` is not available in the current runtime.
   */
  run<T>(fn: () => T | Promise<T>): Promise<T>;

  /**
   * End the trace's root operation.
   *
   * Call this when using the trace in explicit (non-`run()`) mode.
   * Safe to call multiple times — subsequent calls are no-ops.
   */
  end(): void;
}

/**
 * Creates a trace that groups multiple SDK calls under a single parent operation.
 *
 * The returned `TelemetryTrace` extends `TelemetryConfig`, so it can be passed
 * directly as `telemetry` to `generateText`, `streamText`, etc. All SDK calls
 * that share the trace will appear as children of the trace's root operation.
 *
 * @example Explicit passing:
 * ```ts
 * import { createTrace, otel } from 'ai';
 *
 * const trace = createTrace({ ...otel(), functionId: 'my-agent' });
 *
 * await generateText({ model, prompt: 'Hello', telemetry: trace });
 * await generateText({ model, prompt: 'Follow up', telemetry: trace });
 *
 * trace.end();
 * ```
 *
 * @example Implicit via AsyncLocalStorage:
 * ```ts
 * const trace = createTrace(otel());
 *
 * await trace.run(async () => {
 *   await generateText({ model, prompt: 'Hello' });
 *   await generateText({ model, prompt: 'Follow up' });
 * });
 * // trace.end() is called automatically
 * ```
 *
 * @example Per-call overrides (spread the trace, override fields):
 * ```ts
 * const trace = createTrace({ ...otel(), functionId: 'orchestrator' });
 *
 * await generateText({
 *   model, prompt, telemetry: trace,
 * });
 * await generateText({
 *   model, prompt,
 *   telemetry: { ...trace, functionId: 'sub-agent' },
 * });
 *
 * trace.end();
 * ```
 */
export function createTrace(
  config: TelemetryConfig & {
    /**
     * Name for the trace's root operation.
     * Defaults to `functionId` if provided, otherwise `'trace'`.
     */
    name?: string;
  },
): TelemetryTrace {
  const traceId = `trace-${crypto.randomUUID()}`;
  const traceName = config.name ?? config.functionId ?? 'trace';
  let ended = false;

  const rootData: TelemetryEventData = {};
  if (config.functionId != null) {
    rootData.functionId = config.functionId;
  }
  if (config.metadata != null) {
    rootData.metadata = config.metadata;
  }

  config.handler.onOperationStarted?.({
    type: 'operationStarted',
    operationId: traceId,
    operationName: traceName,
    parentOperationId: undefined,
    startTime: Date.now(),
    data: rootData,
  });

  const trace: TelemetryTrace = {
    handler: config.handler,
    functionId: config.functionId,
    metadata: config.metadata,
    recordInputs: config.recordInputs,
    recordOutputs: config.recordOutputs,

    parentOperationId: traceId,

    traceId,

    async run<T>(fn: () => T | Promise<T>): Promise<T> {
      if (traceStorage == null) {
        throw new Error(
          'createTrace().run() requires AsyncLocalStorage (node:async_hooks). ' +
            'Pass the trace explicitly as `telemetry: trace` instead.',
        );
      }

      try {
        return await traceStorage.run(trace, fn);
      } finally {
        trace.end();
      }
    },

    end() {
      if (ended) return;
      ended = true;

      config.handler.onOperationEnded?.({
        type: 'operationEnded',
        operationId: traceId,
        operationName: traceName,
        endTime: Date.now(),
        data: {},
      });
    },
  };

  return trace;
}
