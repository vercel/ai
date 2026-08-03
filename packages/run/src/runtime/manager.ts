import { AsyncResource } from 'node:async_hooks';
import { Buffer } from 'node:buffer';
import { createHash, randomBytes } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import {
  RunAbortedError,
  RunBridgeLimitError,
  RunConcurrencyError,
  RunDetachedBridgeRequestError,
  RunError,
  RunProtocolError,
  RunTimeoutError,
  MAX_SERIALIZED_ERROR_BYTES,
  deserializeError,
  serializeBridgeErrorForGuest,
} from '../errors.js';
import { invokeHostBinding } from '../binding-invocation.js';
import {
  assertContinuationState,
  assertContinuationTokenSize,
} from '../continuation-validation.js';
import { interrupt } from '../interrupt.js';
import { normalizeOptions } from '../utils/options.js';
import {
  hasExactKeys as hasExactOwnKeys,
  isPlainRecord,
} from '../utils/object-validation.js';
import {
  assertJsonPayloadSize,
  normalizeJsonPayload,
  parseJsonPayload,
  toJsonPayload,
} from '../utils/serialization.js';
import { assertSourceSize, transformSource } from '../utils/source-cache.js';
import type {
  BindingContext,
  InternalRunInput,
  NormalizedRunOptions,
  RunContinuationState,
  RunDeterminismState,
  RunInterruptedResult,
  RunLedgerEntry,
  RunResult,
  ContinuationOperationContext,
} from '../types.js';
import { getMaxWorkers } from './max-workers.js';
import type {
  MainToWorkerMessage,
  WorkerBridgeResponse,
  WorkerReadyMessage,
  WorkerResultMessage,
  WorkerBindingRequest,
} from './protocol.js';
import { assertWorkerToMainMessage } from './protocol-validation.js';
import { INLINE_RUN_WORKER_SOURCE } from './worker-source.js';

interface PooledWorker {
  worker: Worker;
  destroyed: boolean;
}

interface ManagedWorkerRun {
  result: Promise<RunResult>;
}

let invocationCounter = 0;
let activeInvocations = 0;
let terminatingWorkers = 0;
let inlineWorkerUrl: URL | undefined;
const idleWorkers: PooledWorker[] = [];
let workerFactory: () => Worker = createRuntimeWorker;

/** @internal Test-only worker protocol injection point. */
export function setRuntimeWorkerFactoryForTest(
  factory: (() => Worker) | undefined,
): void {
  trimIdleWorkers(0);
  workerFactory = factory ?? createRuntimeWorker;
}

/** @internal */
export function getRuntimeDiagnostics(): {
  activeInvocations: number;
  idleWorkers: number;
  destroyedIdleWorkers: number;
  terminatingWorkers: number;
} {
  return {
    activeInvocations,
    idleWorkers: idleWorkers.length,
    destroyedIdleWorkers: idleWorkers.filter(worker => worker.destroyed).length,
    terminatingWorkers,
  };
}

async function readContinuation(
  input: InternalRunInput,
  options: NormalizedRunOptions,
  deadlineMs: number,
  scopeHash: string,
): Promise<RunContinuationState | undefined> {
  if (input.continuation === undefined) {
    if ((input.resolutions?.length ?? 0) > 0) {
      throw new RunProtocolError(
        'Interruption resolutions require a continuation.',
      );
    }
    return undefined;
  }
  assertContinuationTokenSize(input.continuation, options.maxContinuationBytes);
  let state: unknown;
  try {
    state = await raceContinuationOperation(
      context => input.continuationCodec.decode(input.continuation, context),
      input.abortSignal,
      deadlineMs,
      options.timeoutMs,
    );
  } catch (error) {
    if (RunError.isInstance(error)) throw error;
    throw new RunProtocolError('Continuation codec failed to decode token.', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  assertContinuationState(state, input.source, scopeHash, options);
  const pendingIds = new Set(
    state.ledger
      .filter(entry => entry.status === 'interrupted')
      .map(entry => entry.interruptionId),
  );
  const seen = new Set<string>();
  for (const resolution of input.resolutions ?? []) {
    if (
      !isPlainRecord(resolution) ||
      !hasExactOwnKeys(resolution, ['interruptionId', 'value'])
    ) {
      throw new RunProtocolError('An interruption resolution is malformed.');
    }
    if (
      typeof resolution.interruptionId !== 'string' ||
      !pendingIds.has(resolution.interruptionId) ||
      seen.has(resolution.interruptionId)
    ) {
      throw new RunProtocolError(
        'A resolution does not match exactly one pending interruption.',
        { interruptionId: resolution.interruptionId },
      );
    }
    void toJsonPayload(
      resolution.value,
      options.maxBindingOutputBytes,
      `Resolution "${resolution.interruptionId}"`,
    );
    seen.add(resolution.interruptionId);
  }
  if (pendingIds.size === 0 || seen.size !== pendingIds.size) {
    throw new RunProtocolError(
      'A continuation requires exactly one resolution for every pending interruption.',
      { pending: pendingIds.size, received: seen.size },
    );
  }
  return state;
}

async function raceContinuationOperation<T>(
  operation: (context: ContinuationOperationContext) => T | Promise<T>,
  abortSignal: AbortSignal | undefined,
  deadlineMs: number,
  timeoutMs: number,
): Promise<T> {
  if (abortSignal?.aborted) throw new RunAbortedError();
  const operationAbortController = new AbortController();
  let rejectOnAbort!: () => void;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectOnAbort = () => {
      operationAbortController.abort(abortSignal?.reason);
      reject(new RunAbortedError());
    };
  });
  abortSignal?.addEventListener('abort', rejectOnAbort, { once: true });
  const remainingMs = Math.max(0, deadlineMs - Date.now());
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      operationAbortController.abort(new RunTimeoutError(timeoutMs));
      reject(new RunTimeoutError(timeoutMs));
    }, remainingMs);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() =>
        operation({
          abortSignal: operationAbortController.signal,
          deadlineMs,
        }),
      ),
      aborted,
      timedOut,
    ]);
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    abortSignal?.removeEventListener('abort', rejectOnAbort);
  }
}

export async function runManaged(input: InternalRunInput): Promise<RunResult> {
  const normalizedOptions = normalizeOptions(input.limits);
  const deadlineMs = Date.now() + normalizedOptions.timeoutMs;
  if (input.abortSignal?.aborted) throw new RunAbortedError();
  assertSourceSize(input.source, normalizedOptions.maxSourceBytes);
  const scopeHash = createContinuationScopeHash(input, normalizedOptions);
  const continuationState = await readContinuation(
    input,
    normalizedOptions,
    deadlineMs,
    scopeHash,
  );
  const normalizedResolutions = (input.resolutions ?? []).map(resolution => ({
    interruptionId: resolution.interruptionId,
    value: toJsonPayload(
      resolution.value,
      normalizedOptions.maxBindingOutputBytes,
      `Resolution "${resolution.interruptionId}"`,
    ),
  }));
  if (input.abortSignal?.aborted) throw new RunAbortedError();
  const workerOptions = {
    ...normalizedOptions,
    timeoutMs: Math.max(1, deadlineMs - Date.now()),
  };
  const maxWorkers = getMaxWorkers({
    memoryLimitBytes: workerOptions.memoryLimitBytes,
    activeWorkers: activeInvocations,
  });
  if (activeInvocations >= maxWorkers)
    throw new RunConcurrencyError(maxWorkers);
  activeInvocations++;
  try {
    const run = startWorkerRun({
      ...input,
      resolutions: normalizedResolutions,
      source: transformSource(input.source),
      originalSource: input.source,
      ...(continuationState !== undefined ? { continuationState } : {}),
      normalizedOptions: workerOptions,
      timeoutErrorMs: normalizedOptions.timeoutMs,
      maxWorkers,
      scopeHash,
      deadlineMs,
    });
    return await run.result;
  } finally {
    releaseInvocationSlot(normalizedOptions.memoryLimitBytes);
  }
}

function startWorkerRun({
  source,
  originalSource,
  bindings,
  abortSignal,
  resolutions,
  continuationCodec,
  continuationState,
  normalizedOptions,
  timeoutErrorMs,
  maxWorkers,
  scopeHash,
  deadlineMs,
}: InternalRunInput & {
  originalSource: string;
  continuationState?: RunContinuationState;
  normalizedOptions: NormalizedRunOptions;
  timeoutErrorMs: number;
  maxWorkers: number;
  scopeHash: string;
  deadlineMs: number;
}): ManagedWorkerRun {
  const invocationId = `run-${++invocationCounter}`;
  const pooledWorker = acquireWorker(maxWorkers);
  const worker = pooledWorker.worker;
  const invocationContext = new AsyncResource('run:invocation');
  const bindInvocationContext = <Args extends unknown[]>(
    handler: (...args: Args) => void,
  ): ((...args: Args) => void) => {
    return (...args: Args): void => {
      invocationContext.runInAsyncScope(handler, undefined, ...args);
    };
  };

  const outerAbortSignal = abortSignal;
  const invocationAbortController = new AbortController();

  let resultMessage: WorkerResultMessage | undefined;
  let callerSettled = false;
  let terminalReached = false;
  let workerCleanedUp = false;
  let workerCleanup: Promise<void> | undefined;
  let totalBridgeRequests = 0;
  let inFlightBridgeRequests = 0;
  let suspensionSettling = false;
  let interruptedResultPending: RunInterruptedResult | undefined;
  let workerReady = false;
  let workerIdleRequestCount = 0;
  const seenWorkerRequestIds = new Set<string>();
  const ledger: RunLedgerEntry[] = structuredClone(
    continuationState?.ledger ?? [],
  );
  let ledgerBytes =
    Buffer.byteLength(originalSource) +
    128 +
    ledger.reduce((total, entry) => total + ledgerEntryBytes(entry), 0);
  const resolutionMap = new Map(
    (resolutions ?? []).map(item => [item.interruptionId, item.value]),
  );
  const pendingInterruptionIndexes = new Set<number>();
  let nextSettlementOrder = ledger.reduce(
    (max, entry) =>
      entry.status === 'interrupted' ? max : Math.max(max, entry.settledOrder),
    0,
  );
  let nextResponseOrder = 1;
  const queuedBridgeResponses = new Map<number, WorkerBridgeResponse>();
  const determinism: RunDeterminismState = continuationState?.determinism ?? {
    dateNowMs: Date.now(),
    randomSeed: randomBytes(16).toString('hex'),
  };
  const logicalRunId =
    continuationState?.logicalRunId ?? randomBytes(16).toString('hex');

  let resolveResult!: (value: RunResult) => void;
  let rejectResult!: (reason?: unknown) => void;
  const result = new Promise<RunResult>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  const abortInvocation = (reason: unknown) => {
    if (!invocationAbortController.signal.aborted) {
      invocationAbortController.abort(reason);
    }
  };

  const cleanupWorker = (reuseWorker: boolean): Promise<void> => {
    if (workerCleanup !== undefined) {
      return workerCleanup;
    }
    if (workerCleanedUp) {
      return Promise.resolve();
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
      workerCleanup = Promise.resolve();
    } else {
      workerCleanup = destroyWorker(pooledWorker);
    }
    return workerCleanup;
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

  const settleAfterWorkerCleanup = async (
    reuseWorker: boolean,
    settle: () => void,
  ): Promise<void> => {
    await cleanupWorker(reuseWorker);
    settleCaller(settle);
  };

  const failTerminal = (error: unknown) => {
    if (terminalReached) {
      return;
    }
    terminalReached = true;
    abortInvocation(error);
    void settleAfterWorkerCleanup(false, () => rejectResult(error));
  };

  const onAbort = bindInvocationContext(() => {
    failTerminal(new RunAbortedError());
  });

  const timeoutHandle = setTimeout(
    bindInvocationContext(() => {
      failTerminal(new RunTimeoutError(timeoutErrorMs));
    }),
    normalizedOptions.timeoutMs,
  );

  const onMessage = bindInvocationContext((value: unknown) => {
    try {
      assertWorkerToMainMessage(value);
    } catch (error) {
      failTerminal(error);
      return;
    }
    const message = value;
    if (message.invocationId !== invocationId) {
      if (message.type === 'bridge-idle') return;
      failTerminal(
        new RunProtocolError(
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
      try {
        if (message.success) {
          assertJsonPayloadSize(
            message.valueJson!,
            normalizedOptions.maxResultBytes,
            'JavaScript runtime result',
          );
        } else if (
          Buffer.byteLength(JSON.stringify(message.error)) >
          MAX_SERIALIZED_ERROR_BYTES
        ) {
          throw new RunProtocolError(
            'JavaScript runtime worker error exceeds the result size limit.',
          );
        }
      } catch (error) {
        failTerminal(
          error instanceof RunProtocolError
            ? error
            : new RunProtocolError(
                'JavaScript runtime worker result is invalid.',
              ),
        );
        return;
      }
      if (resultMessage !== undefined) {
        failTerminal(
          new RunProtocolError(
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
      workerReady = true;
      handleReadyMessage(message);
      return;
    }

    if (resultMessage !== undefined) {
      failTerminal(
        new RunProtocolError(
          `Worker sent ${message.type} after its terminal result for ${invocationId}.`,
          { invocationId, messageType: message.type },
        ),
      );
      return;
    }

    if (message.type === 'bridge-idle') {
      if (message.requestCount !== totalBridgeRequests) {
        failTerminal(
          new RunProtocolError(
            `Worker bridge-idle count mismatch: expected ${totalBridgeRequests}, received ${message.requestCount}.`,
            {
              expectedRequestCount: totalBridgeRequests,
              receivedRequestCount: message.requestCount,
            },
          ),
        );
        return;
      }
      workerIdleRequestCount = Math.max(
        workerIdleRequestCount,
        message.requestCount,
      );
      settleInterruptionsIfQuiescent();
      return;
    }

    const bridgeIndex = markWorkerRequest(message);
    if (bridgeIndex !== undefined) {
      void handleBindingRequest(message, bridgeIndex);
    }
  });

  const onError = bindInvocationContext((error: Error) => {
    failTerminal(error);
  });

  const onExit = bindInvocationContext((code: number) => {
    if (!terminalReached) {
      failTerminal(
        new Error(
          `JavaScript runtime worker exited before completion with code ${code}.`,
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
    source,
    bindingNamespaces: Object.keys(bindings),
    determinism,
    options: {
      timeoutMs: timeoutErrorMs,
      executionTimeoutMs: getWorkerExecutionTimeoutMs(
        normalizedOptions.timeoutMs,
      ),
      memoryLimitBytes: normalizedOptions.memoryLimitBytes,
      maxStackSizeBytes: normalizedOptions.maxStackSizeBytes,
      maxResultBytes: normalizedOptions.maxResultBytes,
      maxConsoleOutputBytes: normalizedOptions.maxConsoleOutputBytes,
      maxBindingInputBytes: normalizedOptions.maxBindingInputBytes,
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

  function markWorkerRequest(
    message: WorkerBindingRequest,
  ): number | undefined {
    if (terminalReached) {
      return undefined;
    }
    const expectedRequestId = `${invocationId}:bridge-${totalBridgeRequests + 1}`;
    if (message.requestId !== expectedRequestId) {
      failTerminal(
        new RunProtocolError(
          `Worker sent out-of-sequence requestId ${message.requestId}; expected ${expectedRequestId}.`,
          { invocationId, expectedRequestId, requestId: message.requestId },
        ),
      );
      return undefined;
    }
    if (seenWorkerRequestIds.has(message.requestId)) {
      failTerminal(
        new RunProtocolError(
          `Worker sent duplicate requestId ${message.requestId}.`,
          { invocationId, requestId: message.requestId },
        ),
      );
      return undefined;
    }
    seenWorkerRequestIds.add(message.requestId);

    if (totalBridgeRequests >= normalizedOptions.maxBridgeRequests) {
      failTerminal(
        new RunBridgeLimitError(
          `JavaScript runtime exceeded the ${normalizedOptions.maxBridgeRequests} bridge request limit.`,
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
        new RunBridgeLimitError(
          `JavaScript runtime exceeded the ${normalizedOptions.maxInFlightBridgeRequests} in-flight bridge request limit.`,
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

  async function handleBindingRequest(
    message: WorkerBindingRequest,
    bridgeIndex: number,
  ): Promise<void> {
    const entryIndex = bridgeIndex - 1;
    const replayEntry = ledger[entryIndex];
    try {
      if (replayEntry !== undefined) {
        assertReplayMatches(replayEntry, message);
        if (replayEntry.status === 'fulfilled') {
          queueBridgeResponse(replayEntry.settledOrder, {
            type: 'bridge-response',
            invocationId,
            requestId: message.requestId,
            success: true,
            dateNowMs: replayEntry.dateNowMs,
            valueJson: replayEntry.valueJson,
          });
          return;
        }
        if (replayEntry.status === 'rejected') {
          queueBridgeResponse(replayEntry.settledOrder, {
            type: 'bridge-response',
            invocationId,
            requestId: message.requestId,
            success: false,
            dateNowMs: replayEntry.dateNowMs,
            error: replayEntry.error,
          });
          return;
        }
        if (!resolutionMap.has(replayEntry.interruptionId)) {
          pendingInterruptionIndexes.add(entryIndex);
          return;
        }
      }

      const outcome = await invokeHostBinding({
        bindingName: message.bindingName,
        inputJson: message.inputJson,
        bindings,
        context: {
          abortSignal: invocationAbortController.signal,
          invocationId,
          logicalRunId,
          requestId: message.requestId,
          requestIndex: bridgeIndex,
          bindingName: message.bindingName,
          interrupt,
          ...(replayEntry?.status === 'interrupted'
            ? {
                resume: {
                  interruptionId: replayEntry.interruptionId,
                  payload: parseJsonPayload(
                    replayEntry.payloadJson,
                    `Interruption "${replayEntry.interruptionId}" payload`,
                  ),
                  resolution: parseJsonPayload(
                    resolutionMap.get(replayEntry.interruptionId) as string,
                    `Resolution "${replayEntry.interruptionId}"`,
                  ),
                },
              }
            : {}),
        } satisfies BindingContext,
        maxBindingInputBytes: normalizedOptions.maxBindingInputBytes,
        maxBindingOutputBytes: normalizedOptions.maxBindingOutputBytes,
      });
      if (outcome.status === 'interrupted') {
        const interruptionId =
          replayEntry?.status === 'interrupted'
            ? replayEntry.interruptionId
            : `interrupt-${bridgeIndex}`;
        setLedgerEntry(entryIndex, {
          bindingName: message.bindingName,
          inputJson: message.inputJson,
          status: 'interrupted',
          interruptionId,
          payloadJson: outcome.payloadJson,
        });
        pendingInterruptionIndexes.add(entryIndex);
        return;
      }
      setLedgerEntry(entryIndex, {
        bindingName: message.bindingName,
        inputJson: message.inputJson,
        status: 'fulfilled',
        settledOrder: ++nextSettlementOrder,
        dateNowMs: Date.now(),
        valueJson: outcome.valueJson,
      });
      const fulfilledEntry = ledger[entryIndex];
      if (fulfilledEntry?.status !== 'fulfilled') {
        throw new RunProtocolError('Fulfilled ledger entry was not recorded.');
      }
      queueBridgeResponse(fulfilledEntry.settledOrder, {
        type: 'bridge-response',
        invocationId,
        requestId: message.requestId,
        success: true,
        dateNowMs: fulfilledEntry.dateNowMs,
        valueJson: outcome.valueJson,
      });
    } catch (error) {
      if (error instanceof RunProtocolError) {
        failTerminal(error);
        return;
      }
      const serialized = serializeBridgeErrorForGuest(error, 'binding');
      try {
        setLedgerEntry(entryIndex, {
          bindingName: message.bindingName,
          inputJson: message.inputJson,
          status: 'rejected',
          settledOrder: ++nextSettlementOrder,
          dateNowMs: Date.now(),
          error: serialized,
        });
      } catch (recordError) {
        failTerminal(recordError);
        return;
      }
      const rejectedEntry = ledger[entryIndex];
      if (rejectedEntry?.status !== 'rejected') {
        failTerminal(
          new RunProtocolError('Rejected ledger entry was not recorded.'),
        );
        return;
      }
      queueBridgeResponse(rejectedEntry.settledOrder, {
        type: 'bridge-response',
        invocationId,
        requestId: message.requestId,
        success: false,
        dateNowMs: rejectedEntry.dateNowMs,
        error: serialized,
      });
    } finally {
      inFlightBridgeRequests--;
      if (pendingInterruptionIndexes.size > 0 && inFlightBridgeRequests === 0) {
        settleInterruptionsIfQuiescent();
      }
    }
  }

  function queueBridgeResponse(
    settledOrder: number,
    message: WorkerBridgeResponse,
  ): void {
    if (
      queuedBridgeResponses.has(settledOrder) ||
      settledOrder < nextResponseOrder
    ) {
      failTerminal(
        new RunProtocolError('Duplicate bridge settlement order.', {
          settledOrder,
        }),
      );
      return;
    }
    queuedBridgeResponses.set(settledOrder, message);
    while (queuedBridgeResponses.has(nextResponseOrder)) {
      const next = queuedBridgeResponses.get(nextResponseOrder)!;
      queuedBridgeResponses.delete(nextResponseOrder++);
      postBridgeResponse(next);
    }
  }

  function setLedgerEntry(index: number, entry: RunLedgerEntry): void {
    const previous = ledger[index];
    const nextBytes =
      ledgerBytes -
      (previous === undefined ? 0 : ledgerEntryBytes(previous)) +
      ledgerEntryBytes(entry);
    if (nextBytes > normalizedOptions.maxContinuationBytes) {
      throw new RunProtocolError(
        `Continuation state exceeds the ${normalizedOptions.maxContinuationBytes} byte size limit.`,
        { bytes: nextBytes, maxBytes: normalizedOptions.maxContinuationBytes },
      );
    }
    ledger[index] = entry;
    ledgerBytes = nextBytes;
  }

  function settleInterruptionsIfQuiescent(): void {
    if (
      pendingInterruptionIndexes.size > 0 &&
      inFlightBridgeRequests === 0 &&
      workerIdleRequestCount >= totalBridgeRequests
    ) {
      void settleInterruptions();
    }
  }

  function assertReplayMatches(
    entry: RunLedgerEntry,
    message: WorkerBindingRequest,
  ): void {
    if (
      entry.bindingName !== message.bindingName ||
      entry.inputJson !== message.inputJson
    ) {
      throw new RunProtocolError(
        'Continuation replay diverged from the recorded binding ledger.',
        {
          bridgeIndex: message.requestId,
          expectedBindingName: entry.bindingName,
          receivedBindingName: message.bindingName,
        },
      );
    }
  }

  async function settleInterruptions(): Promise<void> {
    if (suspensionSettling || terminalReached) {
      return;
    }
    suspensionSettling = true;
    try {
      const interruptions = [...pendingInterruptionIndexes]
        .sort((left, right) => left - right)
        .map(index => {
          const entry = ledger[index];
          if (entry?.status !== 'interrupted') {
            throw new RunProtocolError(
              'Pending interruption has no matching ledger entry.',
              { index },
            );
          }
          return {
            id: entry.interruptionId,
            bindingName: entry.bindingName,
            arguments: parseJsonPayload(
              entry.inputJson,
              `Interruption "${entry.interruptionId}" arguments`,
            ) as unknown[],
            payload: parseJsonPayload(
              entry.payloadJson,
              `Interruption "${entry.interruptionId}" payload`,
            ),
          };
        });
      const continuation = await raceContinuationOperation(
        context =>
          continuationCodec.encode(
            {
              version: 2,
              runtime: 'run-replay-v2',
              serde: 'run-js-v1',
              source: originalSource,
              logicalRunId,
              scopeHash,
              determinism: { ...determinism },
              ledger: structuredClone(ledger),
            },
            context,
          ),
        outerAbortSignal,
        deadlineMs,
        timeoutErrorMs,
      );
      assertContinuationTokenSize(
        continuation,
        normalizedOptions.maxContinuationBytes,
      );
      const interruptedResult: RunInterruptedResult = {
        status: 'interrupted',
        interruptions,
        continuation,
      };
      interruptedResultPending = interruptedResult;
      abortInvocation(interruptedResult);
      if (workerReady) {
        finalizeInterruptedResult(interruptedResult);
        return;
      }
      // eslint-disable-next-line unicorn/require-post-message-target-origin -- Node.js Worker has no targetOrigin parameter.
      worker.postMessage({ type: 'cancel', invocationId });
    } catch (error) {
      failTerminal(error);
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
    if (interruptedResultPending !== undefined) {
      if (resultMessage === undefined) {
        failTerminal(
          new RunProtocolError(
            `Worker cancelled ${message.invocationId} without a terminal result.`,
          ),
        );
        return;
      }
      terminalReached = true;
      const interruptedResult = interruptedResultPending;
      void settleAfterWorkerCleanup(true, () =>
        resolveResult(interruptedResult),
      );
      return;
    }
    if (resultMessage === undefined) {
      failTerminal(
        new RunProtocolError(
          `JavaScript runtime worker became ready without a result for ${message.invocationId}.`,
          { invocationId: message.invocationId },
        ),
      );
      return;
    }

    if (pendingInterruptionIndexes.size > 0) {
      void settleInterruptions();
      return;
    }
    if (
      continuationState !== undefined &&
      totalBridgeRequests < continuationState.ledger.length
    ) {
      failTerminal(
        new RunProtocolError(
          'Continuation completed before replaying the full binding ledger.',
        ),
      );
      return;
    }

    terminalReached = true;
    const finalResultMessage = resultMessage;
    if (inFlightBridgeRequests > 0) {
      const error = finalResultMessage.success
        ? new RunDetachedBridgeRequestError(
            `JavaScript runtime returned while ${inFlightBridgeRequests} bridge request(s) were still in flight.`,
            {
              invocationId,
              inFlightBridgeRequests,
              totalBridgeRequests,
            },
          )
        : deserializeResultError(finalResultMessage);
      abortInvocation(error);
      void settleAfterWorkerCleanup(false, () => rejectResult(error));
      return;
    }

    void settleAfterWorkerCleanup(true, () =>
      settleWithResultMessage(finalResultMessage, resolveResult, rejectResult),
    );
  }

  function finalizeInterruptedResult(
    interruptedResult: RunInterruptedResult,
  ): void {
    if (terminalReached) return;
    if (resultMessage === undefined) {
      failTerminal(
        new RunProtocolError(
          `Worker became ready without a terminal result for ${invocationId}.`,
        ),
      );
      return;
    }
    terminalReached = true;
    void settleAfterWorkerCleanup(true, () => resolveResult(interruptedResult));
  }
}

function createContinuationScopeHash(
  input: InternalRunInput,
  options: NormalizedRunOptions,
): string {
  const continuationContext = normalizeJsonPayload(
    input.continuationContext,
    options.maxContinuationBytes,
    'Continuation context',
  );
  const bindingManifest = Object.keys(input.bindings)
    .sort()
    .flatMap(namespace =>
      Object.keys(input.bindings[namespace]!)
        .sort()
        .map(name => `${namespace}.${name}`),
    );
  return createHash('sha256')
    .update(
      toJsonPayload(
        {
          audience: input.continuationAudience,
          bindingManifest,
          continuationContext,
          transformedSourceHash: createHash('sha256')
            .update(transformSource(input.source))
            .digest('hex'),
        },
        Number.MAX_SAFE_INTEGER,
        'Continuation scope',
      ),
    )
    .digest('hex');
}

function getWorkerExecutionTimeoutMs(hostTimeoutMs: number): number {
  const cleanupHeadroomMs = Math.min(
    50,
    Math.max(5, Math.floor(hostTimeoutMs / 4)),
  );
  return Math.max(1, hostTimeoutMs - cleanupHeadroomMs);
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
    worker: workerFactory(),
    destroyed: false,
  };
}

function createRuntimeWorker(): Worker {
  return new Worker(getInlineWorkerUrl(), { execArgv: [] });
}

function getInlineWorkerUrl(): URL {
  inlineWorkerUrl ??= new URL(
    `data:text/javascript;base64,${Buffer.from(INLINE_RUN_WORKER_SOURCE).toString('base64')}`,
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

async function destroyWorker(pooledWorker: PooledWorker): Promise<void> {
  if (pooledWorker.destroyed) {
    return;
  }
  pooledWorker.destroyed = true;
  pooledWorker.worker.removeAllListeners();
  terminatingWorkers++;
  try {
    await pooledWorker.worker.terminate();
  } catch {
    // The worker may already have exited between the state check and terminate.
  } finally {
    terminatingWorkers = Math.max(0, terminatingWorkers - 1);
  }
}

function trimIdleWorkers(maxIdleWorkers: number): void {
  while (idleWorkers.length > maxIdleWorkers) {
    const pooledWorker = idleWorkers.pop();
    if (pooledWorker !== undefined) {
      void destroyWorker(pooledWorker);
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
  resolve: (value: RunResult) => void,
  reject: (reason?: unknown) => void,
): void {
  if (!message.success) {
    reject(deserializeResultError(message));
    return;
  }
  resolve({
    status: 'completed',
    value:
      message.valueJson === undefined
        ? undefined
        : parseJsonPayload(message.valueJson, 'JavaScript runtime result'),
  });
}

function deserializeResultError(message: WorkerResultMessage): Error {
  if (message.error === undefined) {
    return new RunProtocolError(
      `JavaScript runtime worker failed without an error for ${message.invocationId}.`,
      { invocationId: message.invocationId },
    );
  }
  return deserializeError(message.error);
}

function ledgerEntryBytes(entry: RunLedgerEntry): number {
  return Buffer.byteLength(JSON.stringify(entry));
}
