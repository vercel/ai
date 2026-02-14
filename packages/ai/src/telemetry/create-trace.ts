import type { TelemetryConfig, InjectedFields } from './types';

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
 * @internal
 */
export function getActiveTrace(): TelemetryTrace | undefined {
  return traceStorage?.getStore();
}

/**
 * A trace groups multiple SDK calls under a single parent operation.
 */
export interface TelemetryTrace extends TelemetryConfig {
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
   */
  end(): void;
}

export function createTrace(
  config: TelemetryConfig & {
    name?: string;
  },
): TelemetryTrace {
  const traceId = `trace-${crypto.randomUUID()}`;
  const traceName = config.name ?? config.functionId ?? 'trace';
  let ended = false;

  // Trace root data only contains injected fields (functionId, metadata)
  const rootData: InjectedFields = {};
  if (config.functionId != null) {
    rootData.functionId = config.functionId;
  }
  if (config.metadata != null) {
    rootData.metadata = config.metadata;
  }

  // Traces use the fallback BaseStartedEvent<string, CommonStartData> variant
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

      // Traces use the fallback BaseEndedEvent<string> variant
      config.handler.onOperationEnded?.({
        type: 'operationEnded',
        operationId: traceId,
        operationName: traceName,
        endTime: Date.now(),
        data: {} as Record<string, never>,
      });
    },
  };

  return trace;
}
