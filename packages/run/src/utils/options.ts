import type { NormalizedRunOptions, RunLimits } from '../types.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MEMORY_LIMIT_BYTES = 64 * 1024 * 1024;
const DEFAULT_STACK_LIMIT_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_RESULT_BYTES = 1024 * 1024;
const DEFAULT_MAX_CONSOLE_OUTPUT_BYTES = 64 * 1024;
const DEFAULT_MAX_SOURCE_BYTES = 256 * 1024;
const DEFAULT_MAX_BINDING_ARGUMENTS_BYTES = 1024 * 1024;
const DEFAULT_MAX_TOOL_OUTPUT_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_BRIDGE_REQUESTS = 256;
const DEFAULT_MAX_IN_FLIGHT_BRIDGE_REQUESTS = 32;
const DEFAULT_MAX_CONTINUATION_BYTES = 32 * 1024 * 1024;

export function normalizeOptions(limits: RunLimits = {}): NormalizedRunOptions {
  return {
    timeoutMs: positiveInteger(
      limits.timeoutMs,
      DEFAULT_TIMEOUT_MS,
      'limits.timeoutMs',
    ),
    memoryLimitBytes: positiveInteger(
      limits.memoryLimitBytes,
      DEFAULT_MEMORY_LIMIT_BYTES,
      'limits.memoryLimitBytes',
    ),
    maxStackSizeBytes: positiveInteger(
      limits.maxStackSizeBytes,
      DEFAULT_STACK_LIMIT_BYTES,
      'limits.maxStackSizeBytes',
    ),
    maxResultBytes: positiveInteger(
      limits.maxResultBytes,
      DEFAULT_MAX_RESULT_BYTES,
      'limits.maxResultBytes',
    ),
    maxConsoleOutputBytes: positiveInteger(
      limits.maxConsoleOutputBytes,
      DEFAULT_MAX_CONSOLE_OUTPUT_BYTES,
      'limits.maxConsoleOutputBytes',
    ),
    maxSourceBytes: positiveInteger(
      limits.maxSourceBytes,
      DEFAULT_MAX_SOURCE_BYTES,
      'limits.maxSourceBytes',
    ),
    maxBindingInputBytes: positiveInteger(
      limits.maxBindingArgumentsBytes,
      DEFAULT_MAX_BINDING_ARGUMENTS_BYTES,
      'limits.maxBindingArgumentsBytes',
    ),
    maxBindingOutputBytes: positiveInteger(
      limits.maxBindingOutputBytes,
      DEFAULT_MAX_TOOL_OUTPUT_BYTES,
      'limits.maxBindingOutputBytes',
    ),
    maxBridgeRequests: positiveInteger(
      limits.maxBridgeRequests,
      DEFAULT_MAX_BRIDGE_REQUESTS,
      'limits.maxBridgeRequests',
    ),
    maxInFlightBridgeRequests: positiveInteger(
      limits.maxInFlightBridgeRequests,
      DEFAULT_MAX_IN_FLIGHT_BRIDGE_REQUESTS,
      'limits.maxInFlightBridgeRequests',
    ),
    maxContinuationBytes: positiveInteger(
      limits.maxContinuationBytes,
      DEFAULT_MAX_CONTINUATION_BYTES,
      'limits.maxContinuationBytes',
    ),
  };
}

function positiveInteger(
  value: number | undefined,
  fallback: number,
  path: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved <= 0) {
    throw new TypeError(`${path} must be a positive integer.`);
  }
  return resolved;
}
