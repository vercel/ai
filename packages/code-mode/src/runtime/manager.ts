import { AsyncResource } from 'node:async_hooks';
import { Buffer } from 'node:buffer';
import { Worker } from 'node:worker_threads';
import {
  CodeModeAbortedError,
  CodeModeBridgeLimitError,
  CodeModeConcurrencyError,
  CodeModeDetachedBridgeRequestError,
  CodeModeProtocolError,
  CodeModeTimeoutError,
  deserializeError,
  serializeBridgeErrorForGuest,
} from '../errors.js';
import { invokeHostTool } from '../tool-invocation.js';
import { normalizeOptions } from '../utils/options.js';
import { assertSourceSize, transformSource } from '../utils/source-cache.js';
import type {
  CodeModeToolExecutionOptions,
  NormalizedCodeModeOptions,
  RunCodeModeInput,
} from '../types.js';
import { getMaxWorkers } from './max-workers.js';
import type {
  MainToWorkerMessage,
  WorkerBridgeResponse,
  WorkerReadyMessage,
  WorkerResultMessage,
  WorkerToolRequest,
  WorkerToMainMessage,
} from './protocol.js';
import { INLINE_CODE_MODE_WORKER_SOURCE } from './worker-source.js';

interface PooledWorker {
  worker: Worker;
  destroyed: boolean;
}

interface ManagedWorkerRun {
  result: Promise<unknown>;
}

let invocationCounter = 0;
let activeInvocations = 0;
let inlineWorkerUrl: URL | undefined;
const idleWorkers: PooledWorker[] = [];

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
  try {
    if (input.toolExecutionOptions?.abortSignal?.aborted) {
      throw new CodeModeAbortedError();
    }

    assertSourceSize(input.js, normalizedOptions.maxSourceBytes);
    const run = startWorkerRun({
      ...input,
      js: transformSource(input.js),
      normalizedOptions,
      maxWorkers,
    });
    return await run.result;
  } finally {
    releaseInvocationSlot(normalizedOptions.memoryLimitBytes);
  }
}

function startWorkerRun({
  js,
  tools,
  toolExecutionOptions,
  normalizedOptions,
  maxWorkers,
}: RunCodeModeInput & {
  normalizedOptions: NormalizedCodeModeOptions;
  maxWorkers: number;
}): ManagedWorkerRun {
  const invocationId = `code-mode-${++invocationCounter}`;
  const pooledWorker = acquireWorker(maxWorkers);
  const worker = pooledWorker.worker;
  const invocationContext = new AsyncResource('ai-sdk-code-mode:invocation');
  const bindInvocationContext = <Args extends unknown[]>(
    handler: (...args: Args) => void,
  ): ((...args: Args) => void) => {
    return (...args: Args): void => {
      invocationContext.runInAsyncScope(handler, undefined, ...args);
    };
  };

  const outerAbortSignal = toolExecutionOptions?.abortSignal;
  const invocationAbortController = new AbortController();
  const forwardedContext =
    toolExecutionOptions?.context ?? toolExecutionOptions?.experimental_context;
  const forwardedExperimentalContext =
    toolExecutionOptions?.experimental_context ?? toolExecutionOptions?.context;
  const baseExecutionOptions: CodeModeToolExecutionOptions = {
    toolCallId: toolExecutionOptions?.toolCallId ?? invocationId,
    messages: toolExecutionOptions?.messages ?? [],
    abortSignal: invocationAbortController.signal,
    ...(forwardedExperimentalContext !== undefined
      ? { experimental_context: forwardedExperimentalContext }
      : {}),
    ...(forwardedContext !== undefined ? { context: forwardedContext } : {}),
  };

  let resultMessage: WorkerResultMessage | undefined;
  let callerSettled = false;
  let terminalReached = false;
  let workerCleanedUp = false;
  let totalBridgeRequests = 0;
  let inFlightBridgeRequests = 0;
  const seenWorkerRequestIds = new Set<string>();

  let resolveResult!: (value: unknown) => void;
  let rejectResult!: (reason?: unknown) => void;
  const result = new Promise<unknown>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
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
    invocationContext.emitDestroy();
    if (reuseWorker) {
      releaseWorker(pooledWorker);
    } else {
      destroyWorker(pooledWorker);
    }
  };

  const settleCaller = (settle: () => void) => {
    if (callerSettled) {
      return;
    }
    callerSettled = true;
    try {
      settle();
    } catch (error) {
      rejectResult(error);
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

  const onAbort = bindInvocationContext(() => {
    failTerminal(new CodeModeAbortedError());
  });

  const timeoutHandle = setTimeout(
    bindInvocationContext(() => {
      failTerminal(new CodeModeTimeoutError(normalizedOptions.timeoutMs));
    }),
    normalizedOptions.timeoutMs,
  );

  const onMessage = bindInvocationContext((message: WorkerToMainMessage) => {
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

    const bridgeIndex = markWorkerRequest(message);
    if (bridgeIndex !== undefined) {
      void handleToolRequest(message, bridgeIndex);
    }
  });

  const onError = bindInvocationContext((error: Error) => {
    failTerminal(error);
  });

  const onExit = bindInvocationContext((code: number) => {
    if (!terminalReached) {
      failTerminal(
        new Error(
          `Code mode worker exited before completion with code ${code}.`,
        ),
      );
    }
  });

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
    },
  };

  if (!terminalReached) {
    try {
      // eslint-disable-next-line unicorn/require-post-message-target-origin -- Node.js Worker has no targetOrigin parameter.
      worker.postMessage(runMessage);
    } catch (error) {
      failTerminal(error);
    }
  }

  return { result };

  function markWorkerRequest(message: WorkerToolRequest): number | undefined {
    if (terminalReached) {
      return undefined;
    }
    if (seenWorkerRequestIds.has(message.requestId)) {
      failTerminal(
        new CodeModeProtocolError(
          `Worker sent duplicate requestId ${message.requestId}.`,
          { invocationId, requestId: message.requestId },
        ),
      );
      return undefined;
    }
    seenWorkerRequestIds.add(message.requestId);

    if (totalBridgeRequests >= normalizedOptions.maxBridgeRequests) {
      failTerminal(
        new CodeModeBridgeLimitError(
          `Code mode exceeded the ${normalizedOptions.maxBridgeRequests} bridge request limit.`,
          {
            invocationId,
            maxBridgeRequests: normalizedOptions.maxBridgeRequests,
          },
        ),
      );
      return undefined;
    }
    if (inFlightBridgeRequests >= normalizedOptions.maxInFlightBridgeRequests) {
      failTerminal(
        new CodeModeBridgeLimitError(
          `Code mode exceeded the ${normalizedOptions.maxInFlightBridgeRequests} in-flight bridge request limit.`,
          {
            invocationId,
            maxInFlightBridgeRequests:
              normalizedOptions.maxInFlightBridgeRequests,
          },
        ),
      );
      return undefined;
    }

    totalBridgeRequests++;
    inFlightBridgeRequests++;
    return totalBridgeRequests;
  }

  async function handleToolRequest(
    message: WorkerToolRequest,
    bridgeIndex: number,
  ): Promise<void> {
    try {
      const valueJson = await invokeHostTool({
        toolName: message.toolName,
        inputJson: message.inputJson,
        tools,
        baseExecutionOptions,
        maxToolInputBytes: normalizedOptions.maxToolInputBytes,
        maxToolOutputBytes: normalizedOptions.maxToolOutputBytes,
        toolCallId: `${baseExecutionOptions.toolCallId}:tool-${bridgeIndex}`,
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
        error: serializeBridgeErrorForGuest(error, 'tool'),
      });
    } finally {
      inFlightBridgeRequests--;
    }
  }

  function postBridgeResponse(message: WorkerBridgeResponse): void {
    if (terminalReached) {
      return;
    }
    try {
      // eslint-disable-next-line unicorn/require-post-message-target-origin -- Node.js Worker has no targetOrigin parameter.
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

    terminalReached = true;
    const finalResultMessage = resultMessage;
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
    worker: new Worker(getInlineWorkerUrl(), { execArgv: [] }),
    destroyed: false,
  };
}

function getInlineWorkerUrl(): URL {
  inlineWorkerUrl ??= new URL(
    `data:text/javascript;base64,${Buffer.from(INLINE_CODE_MODE_WORKER_SOURCE).toString('base64')}`,
  );
  return inlineWorkerUrl;
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

function deserializeResultError(message: WorkerResultMessage): Error {
  if (message.error === undefined) {
    return new CodeModeProtocolError(
      `Code mode worker failed without an error for ${message.invocationId}.`,
      { invocationId: message.invocationId },
    );
  }
  return deserializeError(message.error);
}
