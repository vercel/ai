import os from 'node:os';

const DEFAULT_MAX_WORKERS_CAP = 32;
const DEFAULT_WORKER_OVERHEAD_BYTES = 48 * 1024 * 1024;

let configuredMaxWorkers: number | undefined;

/**
 * Sets the process-global maximum number of active code-mode workers.
 *
 * Pass `undefined` or call without an argument to restore the dynamic
 * memory-based default. The default admits at least one invocation and admits
 * additional workers only when available memory can cover another worker.
 *
 * @param maxWorkers - Positive integer worker cap, or `undefined` to reset.
 */
export function setMaxWorkers(maxWorkers?: number): void {
  if (maxWorkers === undefined) {
    configuredMaxWorkers = undefined;
    return;
  }
  if (!Number.isInteger(maxWorkers) || maxWorkers <= 0) {
    throw new TypeError('maxWorkers must be a positive integer.');
  }
  configuredMaxWorkers = maxWorkers;
}

/**
 * Returns the currently effective worker cap.
 *
 * @internal
 */
export function getMaxWorkers({
  memoryLimitBytes,
  activeWorkers,
}: {
  memoryLimitBytes: number;
  activeWorkers: number;
}): number {
  if (configuredMaxWorkers !== undefined) {
    return configuredMaxWorkers;
  }

  const estimatedBytesPerWorker =
    memoryLimitBytes + DEFAULT_WORKER_OVERHEAD_BYTES;
  const additionalWorkers = Math.floor(
    availableMemory() / estimatedBytesPerWorker,
  );

  return Math.max(
    1,
    Math.min(DEFAULT_MAX_WORKERS_CAP, activeWorkers + additionalWorkers),
  );
}

function availableMemory(): number {
  const processWithAvailableMemory = process as typeof process & {
    availableMemory?: () => number;
  };
  const bytes =
    typeof processWithAvailableMemory.availableMemory === 'function'
      ? processWithAvailableMemory.availableMemory()
      : os.freemem();
  return Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
}
