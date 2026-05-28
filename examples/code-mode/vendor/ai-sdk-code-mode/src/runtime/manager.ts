import { Worker } from 'node:worker_threads';
import {
  CodeModeAbortedError,
  CodeModeBridgeLimitError,
  CodeModeConcurrencyError,
  CodeModeDetachedBridgeRequestError,
  CodeModeProtocolError,
  CodeModeTimeoutError,
  deserializeError,
  serializeError,
} from '../errors.js';
import { executeHostFetch } from '../fetch-policy.js';
import { normalizeOptions } from '../options.js';
import { toJsonPayload } from '../serialization.js';
import { assertSourceSize, transformSource } from '../source-cache.js';
import { invokeHostTool } from '../tool-invocation.js';
import type { RunCodeModeInput } from '../types.js';
import { getMaxWorkers } from './max-workers.js';
import type {
  MainToWorkerMessage,
  WorkerFetchRequest,
  WorkerReadyMessage,
  WorkerResultMessage,
  WorkerToolRequest,
  WorkerToMainMessage,
} from './protocol.js';

let activeInvocations = 0;
let invocationCounter = 0;
const idleWorkers: PooledWorker[] = [];

interface PooledWorker {
  worker: Worker;
  destroyed: boolean;
}

interface ManagedWorkerRun {
  result: Promise<unknown>;
  accountingDone: Promise<void>;
}

export async function runManagedCodeMode(
  input: RunCodeModeInput,
): Promise<unknown> {
  const normalizedOptions = normalizeOptions(input.options);
  const maxWorkers = getMaxWorkers({
    memoryLimitBytes: normalizedOptions.memoryLimitBytes,
    activeWorkers: activeInvocations,
  });
  if (activeInvocations >= maxWorkers) {
    throw new CodeModeConcurrencyError(maxWorkers);
  }

  activeInvocations++;
  let releaseSlotOnExit = true;
  try {
    if (input.toolExecutionOptions?.abortSignal?.aborted) {
      throw new CodeModeAbortedError();
    }

    assertSourceSize(input.js, normalizedOptions.maxSourceBytes);
    const js = transformSource(input.js);
    const run = startWorkerRun({ ...input, js, normalizedOptions, maxWorkers });
    releaseSlotOnExit = false;
    void run.accountingDone.then(
      () => releaseInvocationSlot(normalizedOptions.memoryLimitBytes),
      () => releaseInvocationSlot(normalizedOptions.memoryLimitBytes),
    );
    return await run.result;
  } finally {
    if (releaseSlotOnExit) {
      releaseInvocationSlot(normalizedOptions.memoryLimitBytes);
    }
  }
}

function startWorkerRun({
  js,
  tools,
  toolExecutionOptions,
  options,
  normalizedOptions,
  maxWorkers,
}: RunCodeModeInput & {
  js: string;
  normalizedOptions: ReturnType<typeof normalizeOptions>;
  maxWorkers: number;
}): ManagedWorkerRun {
  const invocationId = `code-mode-${++invocationCounter}`;
  const pooledWorker = acquireWorker(maxWorkers);
  const worker = pooledWorker.worker;

  const outerAbortSignal = toolExecutionOptions?.abortSignal;
  const invocationAbortController = new AbortController();
  let nestedToolCounter = 0;
  let resultMessage: WorkerResultMessage | undefined;
  let callerSettled = false;
  let accountingSettled = false;
  let terminalReached = false;
  let workerCleanedUp = false;
  let totalBridgeRequests = 0;
  let inFlightBridgeRequests = 0;
  const seenWorkerRequestIds = new Set<string>();

  const baseExecutionOptions = {
    toolCallId: toolExecutionOptions?.toolCallId ?? invocationId,
    messages: toolExecutionOptions?.messages ?? [],
    abortSignal: invocationAbortController.signal,
    context:
      'context' in (toolExecutionOptions ?? {})
        ? toolExecutionOptions?.context
        : {},
  };

  let resolveResult!: (value: unknown) => void;
  let rejectResult!: (reason?: unknown) => void;
  const result = new Promise<unknown>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  let resolveAccounting!: () => void;
  const accountingDone = new Promise<void>(resolve => {
    resolveAccounting = resolve;
  });

  const abortInvocation = (reason: unknown) => {
    if (!invocationAbortController.signal.aborted) {
      invocationAbortController.abort(reason);
    }
  };

  const cleanupWorker = (reuseWorker: boolean) => {
    if (workerCleanedUp) {
      return;
    }
    workerCleanedUp = true;
    clearTimeout(timeoutHandle);
    outerAbortSignal?.removeEventListener('abort', onAbort);
    worker.off('message', onMessage);
    worker.off('error', onError);
    worker.off('exit', onExit);
    if (reuseWorker) {
      releaseWorker(pooledWorker);
    } else {
      destroyWorker(pooledWorker);
    }
  };

  const settleAccountingIfDone = () => {
    if (!accountingSettled && callerSettled && inFlightBridgeRequests === 0) {
      accountingSettled = true;
      resolveAccounting();
    }
  };

  const settleCaller = (settle: () => void) => {
    if (callerSettled) {
      return;
    }
    callerSettled = true;
    settleAccountingIfDone();
    try {
      settle();
    } catch (error) {
      rejectResult(error);
    } finally {
      settleAccountingIfDone();
    }
  };

  const failTerminal = (error: unknown) => {
    if (terminalReached) {
      return;
    }
    terminalReached = true;
    abortInvocation(error);
    cleanupWorker(false);
    settleCaller(() => rejectResult(error));
  };

  const onAbort = () => {
    failTerminal(new CodeModeAbortedError());
  };

  const timeoutHandle = setTimeout(() => {
    failTerminal(new CodeModeTimeoutError(normalizedOptions.timeoutMs));
  }, normalizedOptions.timeoutMs);

  const onMessage = (message: WorkerToMainMessage) => {
    if (message.invocationId !== invocationId) {
      failTerminal(
        new CodeModeProtocolError(
          `Worker message invocationId mismatch: expected ${invocationId}, received ${message.invocationId}.`,
          {
            expectedInvocationId: invocationId,
            receivedInvocationId: message.invocationId,
            messageType: message.type,
          },
        ),
      );
      return;
    }

    if (message.type === 'result') {
      if (resultMessage !== undefined) {
        failTerminal(
          new CodeModeProtocolError(
            `Worker sent duplicate result for invocation ${invocationId}.`,
            { invocationId },
          ),
        );
        return;
      }
      resultMessage = message;
      return;
    }

    if (message.type === 'ready') {
      handleReadyMessage(message);
      return;
    }

    if (message.type === 'tool-request') {
      if (markWorkerRequest(message)) {
        void handleToolRequest(message);
      }
      return;
    }

    if (message.type === 'fetch-request' && markWorkerRequest(message)) {
      void handleFetchRequest(message);
    }
  };

  const onError = (error: Error) => {
    failTerminal(error);
  };

  const onExit = (code: number) => {
    if (!terminalReached && code !== 0) {
      failTerminal(new Error(`Code mode worker exited with code ${code}.`));
    }
  };

  worker.on('message', onMessage);
  worker.on('error', onError);
  worker.on('exit', onExit);
  outerAbortSignal?.addEventListener('abort', onAbort, { once: true });
  if (outerAbortSignal?.aborted) {
    onAbort();
  }

  const runMessage: MainToWorkerMessage = {
    type: 'run',
    invocationId,
    js,
    options: {
      timeoutMs: normalizedOptions.timeoutMs,
      memoryLimitBytes: normalizedOptions.memoryLimitBytes,
      maxStackSizeBytes: normalizedOptions.maxStackSizeBytes,
      maxResultBytes: normalizedOptions.maxResultBytes,
      fetchEnabled: normalizedOptions.fetchEnabled,
    },
  };

  if (!terminalReached) {
    try {
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- node:worker_threads Worker, not window.postMessage
      worker.postMessage(runMessage);
    } catch (error) {
      failTerminal(error);
    }
  }

  return { result, accountingDone };

  async function handleToolRequest(message: WorkerToolRequest): Promise<void> {
    try {
      const valueJson = await invokeHostTool({
        toolName: message.toolName,
        inputJson: message.inputJson,
        tools,
        baseExecutionOptions,
        codeModeOptions: options ?? {},
        maxToolInputBytes: normalizedOptions.maxToolInputBytes,
        maxToolOutputBytes: normalizedOptions.maxToolOutputBytes,
        nextToolCallId: () =>
          `${baseExecutionOptions.toolCallId}:tool-${++nestedToolCounter}`,
      });
      postBridgeResponse({
        type: 'bridge-response',
        invocationId,
        requestId: message.requestId,
        success: true,
        valueJson,
      });
    } catch (error) {
      postBridgeResponse({
        type: 'bridge-response',
        invocationId,
        requestId: message.requestId,
        success: false,
        error: serializeError(error),
      });
    } finally {
      inFlightBridgeRequests--;
      settleAccountingIfDone();
    }
  }

  async function handleFetchRequest(
    message: WorkerFetchRequest,
  ): Promise<void> {
    try {
      const response = await executeHostFetch({
        request: message.request,
        fetch: normalizedOptions.fetch,
        policy: normalizedOptions.fetchPolicy,
        signal: invocationAbortController.signal,
      });
      const valueJson = toJsonPayload(
        response,
        normalizedOptions.maxResultBytes,
        'fetch response',
      );
      postBridgeResponse({
        type: 'bridge-response',
        invocationId,
        requestId: message.requestId,
        success: true,
        valueJson,
      });
    } catch (error) {
      postBridgeResponse({
        type: 'bridge-response',
        invocationId,
        requestId: message.requestId,
        success: false,
        error: serializeError(error),
      });
    } finally {
      inFlightBridgeRequests--;
      settleAccountingIfDone();
    }
  }

  function markWorkerRequest(
    message: WorkerToolRequest | WorkerFetchRequest,
  ): boolean {
    if (terminalReached) {
      return false;
    }

    if (resultMessage !== undefined) {
      failTerminal(
        new CodeModeProtocolError(
          `Worker sent ${message.type} after result for invocation ${invocationId}.`,
          {
            invocationId,
            requestId: message.requestId,
            messageType: message.type,
          },
        ),
      );
      return false;
    }

    if (seenWorkerRequestIds.has(message.requestId)) {
      failTerminal(
        new CodeModeProtocolError(
          `Worker reused requestId ${message.requestId} for invocation ${invocationId}.`,
          {
            invocationId,
            requestId: message.requestId,
            messageType: message.type,
          },
        ),
      );
      return false;
    }

    seenWorkerRequestIds.add(message.requestId);

    if (totalBridgeRequests >= normalizedOptions.maxBridgeRequests) {
      postBridgeResponse({
        type: 'bridge-response',
        invocationId,
        requestId: message.requestId,
        success: false,
        error: serializeError(
          new CodeModeBridgeLimitError(
            `Code mode exceeded the maxBridgeRequests limit (${normalizedOptions.maxBridgeRequests}).`,
            {
              invocationId,
              requestId: message.requestId,
              maxBridgeRequests: normalizedOptions.maxBridgeRequests,
            },
          ),
        ),
      });
      return false;
    }

    if (inFlightBridgeRequests >= normalizedOptions.maxInFlightBridgeRequests) {
      postBridgeResponse({
        type: 'bridge-response',
        invocationId,
        requestId: message.requestId,
        success: false,
        error: serializeError(
          new CodeModeBridgeLimitError(
            `Code mode exceeded the maxInFlightBridgeRequests limit (${normalizedOptions.maxInFlightBridgeRequests}).`,
            {
              invocationId,
              requestId: message.requestId,
              maxInFlightBridgeRequests:
                normalizedOptions.maxInFlightBridgeRequests,
            },
          ),
        ),
      });
      return false;
    }

    totalBridgeRequests++;
    inFlightBridgeRequests++;
    return true;
  }

  function postBridgeResponse(message: MainToWorkerMessage): void {
    if (terminalReached || workerCleanedUp) {
      return;
    }
    try {
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- node:worker_threads Worker, not window.postMessage
      worker.postMessage(message);
    } catch (error) {
      failTerminal(error);
    }
  }

  function handleReadyMessage(message: WorkerReadyMessage): void {
    if (terminalReached) {
      return;
    }

    if (resultMessage === undefined) {
      failTerminal(
        new CodeModeProtocolError(
          `Code mode worker became ready without a result for ${message.invocationId}.`,
          { invocationId: message.invocationId },
        ),
      );
      return;
    }

    const finalResultMessage = resultMessage;
    if (finalResultMessage.invocationId !== message.invocationId) {
      failTerminal(
        new CodeModeProtocolError(
          `Worker result/ready invocationId mismatch: result was ${finalResultMessage.invocationId}, ready was ${message.invocationId}.`,
          {
            resultInvocationId: finalResultMessage.invocationId,
            readyInvocationId: message.invocationId,
          },
        ),
      );
      return;
    }

    terminalReached = true;
    if (inFlightBridgeRequests > 0) {
      const error = finalResultMessage.success
        ? new CodeModeDetachedBridgeRequestError(
            `Code mode returned while ${inFlightBridgeRequests} bridge request(s) were still in flight.`,
            {
              invocationId,
              inFlightBridgeRequests,
              totalBridgeRequests,
            },
          )
        : deserializeResultError(finalResultMessage);
      abortInvocation(error);
      cleanupWorker(false);
      settleCaller(() => rejectResult(error));
      return;
    }

    cleanupWorker(true);
    settleCaller(() =>
      settleWithResultMessage(finalResultMessage, resolveResult, rejectResult),
    );
  }
}

function acquireWorker(maxPoolSize: number): PooledWorker {
  let pooledWorker = idleWorkers.pop();
  while (pooledWorker?.destroyed) {
    pooledWorker = idleWorkers.pop();
  }
  pooledWorker ??= createWorker();
  pooledWorker.worker.removeAllListeners('exit');
  pooledWorker.worker.ref();
  trimIdleWorkers(Math.max(0, maxPoolSize - activeInvocations));
  return pooledWorker;
}

function createWorker(): PooledWorker {
  return {
    worker: new Worker(new URL('./worker.js', import.meta.url)),
    destroyed: false,
  };
}

function releaseWorker(pooledWorker: PooledWorker): void {
  if (pooledWorker.destroyed) {
    return;
  }
  pooledWorker.worker.once('exit', () => {
    pooledWorker.destroyed = true;
    const index = idleWorkers.indexOf(pooledWorker);
    if (index !== -1) {
      idleWorkers.splice(index, 1);
    }
  });
  pooledWorker.worker.unref();
  idleWorkers.push(pooledWorker);
}

function destroyWorker(pooledWorker: PooledWorker): void {
  if (pooledWorker.destroyed) {
    return;
  }
  pooledWorker.destroyed = true;
  pooledWorker.worker.removeAllListeners();
  void pooledWorker.worker.terminate();
}

function trimIdleWorkers(maxIdleWorkers: number): void {
  while (idleWorkers.length > maxIdleWorkers) {
    const pooledWorker = idleWorkers.pop();
    if (pooledWorker !== undefined) {
      destroyWorker(pooledWorker);
    }
  }
}

function releaseInvocationSlot(memoryLimitBytes: number): void {
  activeInvocations = Math.max(0, activeInvocations - 1);
  const maxWorkers = getMaxWorkers({
    memoryLimitBytes,
    activeWorkers: activeInvocations,
  });
  trimIdleWorkers(Math.max(0, maxWorkers - activeInvocations));
}

function deserializeResultError(message: WorkerResultMessage): Error {
  return deserializeError(
    message.error ?? { name: 'Error', message: 'Unknown worker error.' },
  );
}

function settleWithResultMessage(
  message: WorkerResultMessage,
  resolve: (value: unknown) => void,
  reject: (reason?: unknown) => void,
): void {
  if (!message.success) {
    reject(deserializeResultError(message));
    return;
  }
  resolve(
    message.valueJson === '' || message.valueJson === undefined
      ? undefined
      : JSON.parse(message.valueJson),
  );
}
