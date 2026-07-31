import { AsyncResource } from 'node:async_hooks';
import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import {
  isCodeModeApprovalInterruptPayload,
  normalizeApprovalResolution,
} from '../approval.js';
import {
  resolveCodeModeContinuationSecurity,
  signCodeModeContinuation,
  verifyCodeModeContinuation,
  type ResolvedCodeModeContinuationSecurity,
} from '../continuation-capability.js';
import {
  CodeModeAbortedError,
  CodeModeBridgeLimitError,
  CodeModeConcurrencyError,
  CodeModeDetachedBridgeRequestError,
  CodeModeProtocolError,
  CodeModeTimeoutError,
  CodeModeToolApprovalDeniedError,
  deserializeError,
  serializeBridgeErrorForGuest,
} from '../errors.js';
import { invokeHostTool } from '../tool-invocation.js';
import { normalizeOptions } from '../utils/options.js';
import { assertSourceSize, transformSource } from '../utils/source-cache.js';
import type {
  CodeModeContinuationLedgerEntry,
  CodeModeInterrupt,
  CodeModeInterruptExecutionContext,
  CodeModeToolExecutionOptions,
  NormalizedCodeModeOptions,
  RunCodeModeInput,
} from '../types.js';
import { getMaxWorkers } from './max-workers.js';
import type {
  MainToWorkerMessage,
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
  const continuationSecurity = resolveCodeModeContinuationSecurity(
    input.options?.continuationSecurity,
  );
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
    const js = transformSource(input.js);
    assertContinuationInput({
      js,
      continuation: input.continuation,
      interruptResolution: input.interruptResolution,
      continuationSecurity,
    });
    const run = startWorkerRun({
      ...input,
      js,
      normalizedOptions,
      maxWorkers,
      continuationSecurity,
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
  options,
  continuation,
  interruptResolution,
  normalizedOptions,
  maxWorkers,
  continuationSecurity,
}: RunCodeModeInput & {
  normalizedOptions: NormalizedCodeModeOptions;
  maxWorkers: number;
  continuationSecurity: ResolvedCodeModeContinuationSecurity;
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
  let nestedToolCounter = getMaxNestedToolCounter(continuation?.ledger ?? []);
  const forwardedContext =
    toolExecutionOptions?.context ?? toolExecutionOptions?.experimental_context;
  const forwardedExperimentalContext =
    toolExecutionOptions?.experimental_context ?? toolExecutionOptions?.context;
  const baseExecutionOptions: CodeModeToolExecutionOptions = {
    toolCallId:
      toolExecutionOptions?.toolCallId ??
      continuation?.outerToolCallId ??
      invocationId,
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
  let interruptEntryIndex: number | undefined;
  let interruptDrainCounter = 0;
  let pendingInterruptDrainId: string | undefined;
  let interruptResolutionConsumed = interruptResolution === undefined;
  const seenWorkerRequestIds = new Set<string>();
  const bridgeLedger = cloneLedger(continuation?.ledger ?? []);
  const determinism = continuation?.determinism ?? createDeterminismState();

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

    if (message.type === 'bridge-drained') {
      if (
        pendingInterruptDrainId === undefined ||
        message.drainId !== pendingInterruptDrainId
      ) {
        failTerminal(
          new CodeModeProtocolError(
            `Worker sent unexpected bridge drain acknowledgement ${message.drainId}.`,
            {
              invocationId,
              expectedDrainId: pendingInterruptDrainId,
              receivedDrainId: message.drainId,
            },
          ),
        );
        return;
      }
      pendingInterruptDrainId = undefined;
      if (inFlightBridgeRequests === 0) {
        settleInterrupt();
      }
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
    determinism,
    options: {
      timeoutMs: normalizedOptions.timeoutMs,
      memoryLimitBytes: normalizedOptions.memoryLimitBytes,
      maxStackSizeBytes: normalizedOptions.maxStackSizeBytes,
      maxResultBytes: normalizedOptions.maxResultBytes,
      maxConsoleOutputBytes: normalizedOptions.maxConsoleOutputBytes,
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
    const replayEntry = bridgeLedger[bridgeIndex - 1];
    try {
      if (replayEntry !== undefined) {
        assertReplayEntryMatches(replayEntry, message, bridgeIndex);

        if (replayEntry.status === 'fulfilled') {
          postBridgeResponse({
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
          postBridgeResponse({
            type: 'bridge-response',
            invocationId,
            requestId: message.requestId,
            success: false,
            dateNowMs: replayEntry.dateNowMs,
            error: replayEntry.error,
          });
          return;
        }

        if (interruptResolution?.interruptId !== replayEntry.interruptId) {
          requestInterrupt(bridgeIndex - 1);
          return;
        }

        interruptResolutionConsumed = true;
        const isApproval = isCodeModeApprovalInterruptPayload(
          replayEntry.interruptPayload,
        );
        if (isApproval) {
          const decision = normalizeApprovalResolution(
            interruptResolution.resolution,
          );
          if (!decision.approved) {
            const error = new CodeModeToolApprovalDeniedError(
              replayEntry.name,
              fromJsonPayload(message.inputJson),
              replayEntry.toolCallId,
              decision.reason,
            );
            const dateNowMs = Date.now();
            const guestError = serializeBridgeErrorForGuest(error, 'tool');
            bridgeLedger[bridgeIndex - 1] = {
              kind: 'tool',
              name: message.toolName,
              inputJson: message.inputJson,
              toolCallId: replayEntry.toolCallId,
              status: 'rejected',
              dateNowMs,
              error: guestError,
            };
            postBridgeResponse({
              type: 'bridge-response',
              invocationId,
              requestId: message.requestId,
              success: false,
              dateNowMs,
              error: guestError,
            });
            return;
          }
        }

        const codeModeInterrupt: CodeModeInterruptExecutionContext | undefined =
          isApproval
            ? undefined
            : {
                interruptId: replayEntry.interruptId,
                payload: replayEntry.interruptPayload,
                resolution: interruptResolution.resolution,
              };
        const outcome = await invokeHostTool({
          toolName: message.toolName,
          inputJson: message.inputJson,
          tools,
          baseExecutionOptions,
          codeModeOptions: options ?? {},
          maxToolInputBytes: normalizedOptions.maxToolInputBytes,
          maxToolOutputBytes: normalizedOptions.maxToolOutputBytes,
          toolCallId: replayEntry.toolCallId,
          ...(codeModeInterrupt !== undefined ? { codeModeInterrupt } : {}),
          skipApproval: true,
        });
        if (outcome.type === 'interrupted') {
          bridgeLedger[bridgeIndex - 1] = {
            kind: 'tool',
            name: message.toolName,
            inputJson: message.inputJson,
            toolCallId: replayEntry.toolCallId,
            interruptId: `${replayEntry.toolCallId}:interrupt`,
            interruptPayload: outcome.payload,
            status: 'interrupted',
          };
          requestInterrupt(bridgeIndex - 1);
          return;
        }

        const dateNowMs = Date.now();
        bridgeLedger[bridgeIndex - 1] = {
          kind: 'tool',
          name: message.toolName,
          inputJson: message.inputJson,
          toolCallId: replayEntry.toolCallId,
          status: 'fulfilled',
          dateNowMs,
          valueJson: outcome.valueJson,
        };
        postBridgeResponse({
          type: 'bridge-response',
          invocationId,
          requestId: message.requestId,
          success: true,
          dateNowMs,
          valueJson: outcome.valueJson,
        });
        return;
      }

      const toolCallId = `${baseExecutionOptions.toolCallId}:tool-${++nestedToolCounter}`;
      const outcome = await invokeHostTool({
        toolName: message.toolName,
        inputJson: message.inputJson,
        tools,
        baseExecutionOptions,
        codeModeOptions: options ?? {},
        maxToolInputBytes: normalizedOptions.maxToolInputBytes,
        maxToolOutputBytes: normalizedOptions.maxToolOutputBytes,
        toolCallId,
      });
      if (outcome.type === 'interrupted') {
        bridgeLedger[bridgeIndex - 1] = {
          kind: 'tool',
          name: message.toolName,
          inputJson: message.inputJson,
          toolCallId,
          interruptId: `${toolCallId}:interrupt`,
          interruptPayload: outcome.payload,
          status: 'interrupted',
        };
        requestInterrupt(bridgeIndex - 1);
        return;
      }

      const dateNowMs = Date.now();
      bridgeLedger[bridgeIndex - 1] = {
        kind: 'tool',
        name: message.toolName,
        inputJson: message.inputJson,
        toolCallId,
        status: 'fulfilled',
        dateNowMs,
        valueJson: outcome.valueJson,
      };
      postBridgeResponse({
        type: 'bridge-response',
        invocationId,
        requestId: message.requestId,
        success: true,
        dateNowMs,
        valueJson: outcome.valueJson,
      });
    } catch (error) {
      if (error instanceof CodeModeProtocolError) {
        failTerminal(error);
        return;
      }
      const dateNowMs = Date.now();
      const guestError = serializeBridgeErrorForGuest(error, 'tool');
      const toolCallId =
        replayEntry?.toolCallId ??
        `${baseExecutionOptions.toolCallId}:tool-${nestedToolCounter}`;
      if (
        replayEntry === undefined ||
        (replayEntry.status === 'interrupted' &&
          interruptResolution?.interruptId === replayEntry.interruptId)
      ) {
        bridgeLedger[bridgeIndex - 1] = {
          kind: 'tool',
          name: message.toolName,
          inputJson: message.inputJson,
          toolCallId,
          status: 'rejected',
          dateNowMs,
          error: guestError,
        };
      }
      postBridgeResponse({
        type: 'bridge-response',
        invocationId,
        requestId: message.requestId,
        success: false,
        dateNowMs,
        error: guestError,
      });
    } finally {
      inFlightBridgeRequests--;
      settleInterruptIfReady();
    }
  }

  function requestInterrupt(entryIndex: number): void {
    interruptEntryIndex ??= entryIndex;
  }

  function settleInterruptIfReady(): void {
    if (
      interruptEntryIndex === undefined ||
      terminalReached ||
      inFlightBridgeRequests > 0 ||
      pendingInterruptDrainId !== undefined ||
      !interruptResolutionConsumed
    ) {
      return;
    }
    pendingInterruptDrainId = `${invocationId}:drain-${++interruptDrainCounter}`;
    postBridgeResponse({
      type: 'bridge-drain',
      invocationId,
      drainId: pendingInterruptDrainId,
    });
  }

  function settleInterrupt(): void {
    if (
      interruptEntryIndex === undefined ||
      terminalReached ||
      inFlightBridgeRequests > 0 ||
      !interruptResolutionConsumed
    ) {
      return;
    }

    const entry = bridgeLedger[interruptEntryIndex];
    if (entry === undefined || entry.status !== 'interrupted') {
      failTerminal(
        new CodeModeProtocolError(
          'Code mode interruption references a missing or resolved ledger entry.',
          { invocationId, interruptEntryIndex },
        ),
      );
      return;
    }

    const continuationState = signCodeModeContinuation(
      {
        version: 1,
        js,
        outerToolCallId: baseExecutionOptions.toolCallId,
        determinism: { ...determinism },
        ledger: cloneLedger(bridgeLedger),
      },
      continuationSecurity,
    );
    const interrupt: CodeModeInterrupt = {
      type: 'code-mode-interrupt',
      interruptId: entry.interruptId,
      toolName: entry.name,
      toolCallId: entry.toolCallId,
      outerToolCallId: continuationState.outerToolCallId,
      input: fromJsonPayload(entry.inputJson),
      payload: structuredClone(entry.interruptPayload),
      continuation: continuationState,
    };

    terminalReached = true;
    abortInvocation(interrupt);
    cleanupWorker(false);
    settleCaller(() => resolveResult(interrupt));
  }

  function postBridgeResponse(message: MainToWorkerMessage): void {
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
    if (interruptEntryIndex !== undefined) {
      settleInterruptIfReady();
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

    if (!interruptResolutionConsumed) {
      failTerminal(
        new CodeModeProtocolError(
          'Code mode continuation completed without consuming its interrupt resolution.',
          { interruptId: interruptResolution?.interruptId },
        ),
      );
      return;
    }
    if (
      continuation !== undefined &&
      totalBridgeRequests < bridgeLedger.length
    ) {
      failTerminal(
        new CodeModeProtocolError(
          'Code mode continuation returned before replaying the full bridge ledger.',
          {
            replayedBridgeRequests: totalBridgeRequests,
            ledgerEntries: bridgeLedger.length,
          },
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

function assertContinuationInput({
  js,
  continuation,
  interruptResolution,
  continuationSecurity,
}: {
  js: string;
  continuation: RunCodeModeInput['continuation'];
  interruptResolution: RunCodeModeInput['interruptResolution'];
  continuationSecurity: ResolvedCodeModeContinuationSecurity;
}): void {
  if (continuation === undefined) {
    if (interruptResolution !== undefined) {
      throw new CodeModeProtocolError(
        'A code-mode interrupt resolution was provided without continuation state.',
      );
    }
    return;
  }

  verifyCodeModeContinuation(continuation, continuationSecurity);
  if (continuation.version !== 1) {
    throw new CodeModeProtocolError(
      'Unsupported code-mode continuation version.',
    );
  }
  if (continuation.js !== js) {
    throw new CodeModeProtocolError(
      'Code mode continuation source does not match the resumed source.',
    );
  }
  if (
    !Number.isInteger(continuation.determinism.dateNowMs) ||
    !/^[0-9a-f]{32}$/i.test(continuation.determinism.randomSeed)
  ) {
    throw new CodeModeProtocolError(
      'Code mode continuation determinism state is malformed.',
    );
  }
  for (const entry of continuation.ledger) {
    if (
      entry.kind !== 'tool' ||
      typeof entry.name !== 'string' ||
      typeof entry.inputJson !== 'string' ||
      typeof entry.toolCallId !== 'string'
    ) {
      throw new CodeModeProtocolError(
        'Code mode continuation ledger is malformed.',
      );
    }
  }
  if (interruptResolution !== undefined) {
    const matches = continuation.ledger.filter(
      entry =>
        entry.status === 'interrupted' &&
        entry.interruptId === interruptResolution.interruptId,
    );
    if (matches.length !== 1) {
      throw new CodeModeProtocolError(
        'Interrupt resolution does not match exactly one pending continuation ledger entry.',
        {
          interruptId: interruptResolution.interruptId,
          matches: matches.length,
        },
      );
    }
  }
}

function assertReplayEntryMatches(
  entry: CodeModeContinuationLedgerEntry,
  message: WorkerToolRequest,
  bridgeIndex: number,
): void {
  if (
    entry.name !== message.toolName ||
    entry.inputJson !== message.inputJson
  ) {
    throw new CodeModeProtocolError(
      'Code mode continuation replay diverged from its bridge ledger.',
      {
        bridgeIndex,
        expectedToolName: entry.name,
        receivedToolName: message.toolName,
      },
    );
  }
}

function createDeterminismState(): {
  dateNowMs: number;
  randomSeed: string;
} {
  return {
    dateNowMs: Date.now(),
    randomSeed: randomBytes(16).toString('hex'),
  };
}

function cloneLedger(
  ledger: CodeModeContinuationLedgerEntry[],
): CodeModeContinuationLedgerEntry[] {
  return structuredClone(ledger);
}

function getMaxNestedToolCounter(
  ledger: CodeModeContinuationLedgerEntry[],
): number {
  let max = 0;
  for (const entry of ledger) {
    const match = /:tool-(\d+)$/u.exec(entry.toolCallId);
    if (match !== null) {
      max = Math.max(max, Number(match[1]));
    }
  }
  return max;
}

function fromJsonPayload(valueJson: string): unknown {
  return valueJson === '' ? undefined : JSON.parse(valueJson);
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
