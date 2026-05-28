import type * as diagnosticsChannelModule from 'node:diagnostics_channel';
import {
  AI_SDK_TELEMETRY_TRACING_CHANNEL,
  type TelemetryTracingChannelMessage,
} from './tracing-channel';
import { isNodeRuntime } from '../util/is-node-runtime';

type DiagnosticsChannel = typeof diagnosticsChannelModule;

let diagnosticsChannelPromise:
  | Promise<DiagnosticsChannel | undefined>
  | undefined;

/**
 * Loads Node's diagnostics channel module only when the current runtime supports
 * it. Unsupported runtimes and failed imports intentionally resolve to
 * undefined so telemetry tracing never crashes user code.
 */
async function loadDiagnosticsChannel(): Promise<
  DiagnosticsChannel | undefined
> {
  if (!isNodeRuntime()) {
    return undefined;
  }

  if (diagnosticsChannelPromise == null) {
    diagnosticsChannelPromise = (
      import(
        /* webpackIgnore: true */
        'node:diagnostics_channel'
      ) as Promise<DiagnosticsChannel>
    ).catch(() => undefined);
  }

  return diagnosticsChannelPromise;
}

/**
 * Runs an async operation inside the AI SDK telemetry tracing channel when
 * tracing subscribers exist. Without Node diagnostics-channel support, without
 * tracingChannel support, or without subscribers, this is a direct pass-through.
 *
 * The execution bookkeeping preserves the original model/tool result or error
 * if tracing itself throws, and prevents falling back by calling `execute` a
 * second time.
 */
export async function traceTelemetryChannelPromise<T>(
  message: TelemetryTracingChannelMessage,
  execute: () => PromiseLike<T>,
): Promise<T> {
  const diagnosticsChannel = await loadDiagnosticsChannel();
  const tracingChannel = diagnosticsChannel?.tracingChannel?.(
    AI_SDK_TELEMETRY_TRACING_CHANNEL,
  );

  if (tracingChannel?.hasSubscribers !== true) {
    return await execute();
  }

  let executePromise: Promise<T> | undefined;
  let executionResult: T | undefined;
  let executionError: unknown;
  let hasExecutionResult = false;
  let hasExecutionError = false;

  const tracedExecute = () => {
    try {
      executePromise = Promise.resolve(execute());
    } catch (error) {
      executePromise = Promise.reject(error);
    }

    executePromise = executePromise.then(
      result => {
        executionResult = result;
        hasExecutionResult = true;
        return result;
      },
      error => {
        executionError = error;
        hasExecutionError = true;
        throw error;
      },
    );

    return executePromise;
  };

  try {
    return await tracingChannel.tracePromise(tracedExecute, message);
  } catch {
    if (hasExecutionError) {
      throw executionError;
    }

    if (hasExecutionResult) {
      return executionResult as T;
    }

    if (executePromise != null) {
      return await executePromise;
    }

    return await execute();
  }
}
