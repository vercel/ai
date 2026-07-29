import type { CodeModeOptions, NormalizedCodeModeOptions } from './types.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MEMORY_LIMIT_BYTES = 64 * 1024 * 1024;
const DEFAULT_STACK_LIMIT_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_RESULT_BYTES = 1024 * 1024;
const DEFAULT_MAX_SOURCE_BYTES = 256 * 1024;
const DEFAULT_MAX_TOOL_INPUT_BYTES = 1024 * 1024;
const DEFAULT_MAX_TOOL_OUTPUT_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_BRIDGE_REQUESTS = 256;
const DEFAULT_MAX_IN_FLIGHT_BRIDGE_REQUESTS = 32;

export function normalizeOptions(
  options: CodeModeOptions = {},
): NormalizedCodeModeOptions {
  const executionPolicy = options.executionPolicy ?? {};

  return {
    timeoutMs: positiveInteger(
      executionPolicy.timeoutMs,
      DEFAULT_TIMEOUT_MS,
      'executionPolicy.timeoutMs',
    ),
    memoryLimitBytes: positiveInteger(
      executionPolicy.memoryLimitBytes,
      DEFAULT_MEMORY_LIMIT_BYTES,
      'executionPolicy.memoryLimitBytes',
    ),
    maxStackSizeBytes: positiveInteger(
      executionPolicy.maxStackSizeBytes,
      DEFAULT_STACK_LIMIT_BYTES,
      'executionPolicy.maxStackSizeBytes',
    ),
    maxResultBytes: positiveInteger(
      executionPolicy.maxResultBytes,
      DEFAULT_MAX_RESULT_BYTES,
      'executionPolicy.maxResultBytes',
    ),
    maxSourceBytes: positiveInteger(
      executionPolicy.maxSourceBytes,
      DEFAULT_MAX_SOURCE_BYTES,
      'executionPolicy.maxSourceBytes',
    ),
    maxToolInputBytes: positiveInteger(
      executionPolicy.maxToolInputBytes,
      DEFAULT_MAX_TOOL_INPUT_BYTES,
      'executionPolicy.maxToolInputBytes',
    ),
    maxToolOutputBytes: positiveInteger(
      executionPolicy.maxToolOutputBytes,
      DEFAULT_MAX_TOOL_OUTPUT_BYTES,
      'executionPolicy.maxToolOutputBytes',
    ),
    maxBridgeRequests: positiveInteger(
      executionPolicy.maxBridgeRequests,
      DEFAULT_MAX_BRIDGE_REQUESTS,
      'executionPolicy.maxBridgeRequests',
    ),
    maxInFlightBridgeRequests: positiveInteger(
      executionPolicy.maxInFlightBridgeRequests,
      DEFAULT_MAX_IN_FLIGHT_BRIDGE_REQUESTS,
      'executionPolicy.maxInFlightBridgeRequests',
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
