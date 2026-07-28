import { AsyncResource } from 'node:async_hooks';
import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import {
  isCodeModeApprovalInterruptPayload,
  normalizeApprovalResolution,
} from '../approval.js';
import {
  type ResolvedCodeModeContinuationSecurity,
  resolveCodeModeContinuationSecurity,
  signCodeModeContinuation,
  verifyCodeModeContinuation,
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
  serializeError,
} from '../errors.js';
import { executeHostFetch } from '../fetch-policy.js';
import { normalizeOptions } from '../options.js';
import { toJsonPayload } from '../serialization.js';
import { assertSourceSize, transformSource } from '../source-cache.js';
import {
  addTelemetryEvent,
  endTelemetrySpan,
  recordTelemetryError,
  startTelemetrySpan,
} from '../telemetry.js';
import { invokeHostTool } from '../tool-invocation.js';
import type {
  CodeModeContinuation,
  CodeModeContinuationLedgerEntry,
  CodeModeDeterminismState,
  CodeModeFetchRequestEvent,
  CodeModeFetchResultEvent,
  CodeModeInterrupt,
  CodeModeInterruptEvent,
  CodeModeInterruptExecutionContext,
  CodeModeNestedToolCallEvent,
  CodeModeNestedToolResultEvent,
  CodeModeTrace,
  CodeModeTraceEntry,
  CodeModeWorkerUrl,
  RunCodeModeInput,
  SerializableError,
} from '../types.js';
import { getMaxWorkers } from './max-workers.js';
import type {
  MainToWorkerMessage,
  WorkerFetchRequest,
  WorkerReadyMessage,
  WorkerResultMessage,
  WorkerToMainMessage,
  WorkerToolRequest,
} from './protocol.js';
import { INLINE_CODE_MODE_WORKER_SOURCE } from './worker-source.js';

let activeInvocations = 0;
let invocationCounter = 0;
let configuredWorkerUrl: CodeModeWorkerUrl | undefined;
let inlineWorkerUrl: URL | undefined;
const idleWorkers: PooledWorker[] = [];

interface PooledWorker {
  worker: Worker;
  destroyed: boolean;
}

interface ManagedWorkerRun {
  result: Promise<unknown>;
  accountingDone: Promise<void>;
}

/**
 * Sets the process-global worker script URL used for new code-mode workers.
 *
 * This is intended for advanced integrations that provide a custom,
 * self-contained worker. Call this before starting invocations.
 * Active workers keep running; idle workers are retired so future invocations
 * use the new location.
 *
 * @param workerUrl - Node.js worker path or URL, or `undefined` to reset.
 */
export function setCodeModeWorkerUrl(workerUrl?: CodeModeWorkerUrl): void {
  configuredWorkerUrl =
    workerUrl === undefined ? undefined : normalizeWorkerUrl(workerUrl);
  trimIdleWorkers(0);
}

/**
 * Returns the worker script URL currently used for new code-mode workers.
 */
export function getCodeModeWorkerUrl(): CodeModeWorkerUrl {
  return configuredWorkerUrl ?? getDefaultCodeModeWorkerUrl();
}

/**
 * Returns the package default worker script URL.
 */
export function getDefaultCodeModeWorkerUrl(): URL {
  return getInlineWorkerUrl();
}

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
  let releaseSlotOnExit = true;
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

function assertContinuationInput({
  js,
  continuation,
  interruptResolution,
  continuationSecurity,
}: {
  js: string;
  continuation: RunCodeModeInput['continuation'] | undefined;
  interruptResolution: RunCodeModeInput['interruptResolution'] | undefined;
  continuationSecurity: ResolvedCodeModeContinuationSecurity;
}): void {
  if (continuation === undefined) {
    if (interruptResolution !== undefined) {
      throw new CodeModeProtocolError(
        'A code-mode interrupt resolution was provided without continuation state.',
        {
          hasInterruptResolution: interruptResolution !== undefined,
        },
      );
    }
    return;
  }

  verifyCodeModeContinuation(continuation, continuationSecurity);

  if (continuation.version !== 1) {
    throw new CodeModeProtocolError(
      'Unsupported code-mode continuation version.',
      {
        version: continuation.version,
      },
    );
  }
  if (continuation.js !== js) {
    throw new CodeModeProtocolError(
      'Code mode continuation source does not match the resumed source.',
      {
        continuationSourceBytes: byteLength(continuation.js),
        resumedSourceBytes: byteLength(js),
      },
    );
  }
  if (typeof continuation.outerToolCallId !== 'string') {
    throw new CodeModeProtocolError(
      'Code mode continuation outerToolCallId must be a string.',
      { outerToolCallId: continuation.outerToolCallId },
    );
  }
  assertDeterminismState(continuation.determinism);
  assertContinuationLedgerShape(continuation);

  if (interruptResolution !== undefined) {
    const matches = continuation.ledger.filter(
      entry =>
        entry.kind === 'tool' &&
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
  js: string;
  normalizedOptions: ReturnType<typeof normalizeOptions>;
  maxWorkers: number;
  continuationSecurity: ResolvedCodeModeContinuationSecurity;
}): ManagedWorkerRun {
  const invocationId = `code-mode-${++invocationCounter}`;
  const pooledWorker = acquireWorker(maxWorkers);
  const worker = pooledWorker.worker;

  // A worker's `message`/`error`/`exit` events fire under the async context in
  // which its underlying MessagePort was created. Workers are pooled and reused
  // across invocations, so that is the context of whichever invocation first
  // created the worker — not the one running now. Without intervention, every
  // host-side callback the bridge dispatches (tool `execute`, `needsApproval`,
  // lifecycle hooks, fetch policy) would run under that stale context, so any
  // `AsyncLocalStorage` a caller relies on (request scope, auth, OpenTelemetry,
  // per-tenant state) would resolve against the wrong invocation and silently
  // leak state across invocations.
  //
  // Capture this invocation's context here, at the synchronous entry point, and
  // re-enter it for every worker event. `AsyncResource` snapshots all active
  // `AsyncLocalStorage` stores generically, so this works for any consumer
  // without code mode knowing which stores exist. Binding the worker event
  // handlers is the single chokepoint through which every host callback flows,
  // so callbacks added later inherit the correct context for free.
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
  let resultMessage: WorkerResultMessage | undefined;
  let callerSettled = false;
  let accountingSettled = false;
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
  const forwardedContext =
    toolExecutionOptions?.context ?? toolExecutionOptions?.experimental_context;
  const forwardedExperimentalContext =
    toolExecutionOptions?.experimental_context ?? toolExecutionOptions?.context;

  const baseExecutionOptions = {
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
  const invocationStartedAtMs = Date.now();
  const trace: CodeModeTrace = {
    invocationId,
    outerToolCallId: baseExecutionOptions.toolCallId,
    status: 'completed',
    startedAtMs: invocationStartedAtMs,
    completedAtMs: invocationStartedAtMs,
    durationMs: 0,
    bridgeRequests: [],
  };
  let traceFinished = false;
  const rootSpan = startTelemetrySpan(
    options?.telemetry,
    'ai.code_mode.execute',
    {
      'code_mode.invocation.id': invocationId,
      'code_mode.outer_tool_call.id': baseExecutionOptions.toolCallId,
      'code_mode.continuation': continuation !== undefined,
      'code_mode.fetch.enabled': normalizedOptions.fetchEnabled,
      'code_mode.max_workers': maxWorkers,
      ...(options?.telemetry?.recordInputs !== false
        ? { 'code_mode.source.bytes': byteLength(js) }
        : {}),
    },
  );

  const emitNestedToolCall = async (
    event: CodeModeNestedToolCallEvent,
  ): Promise<void> => {
    await emitLifecycleHook('onNestedToolCall', event);
  };

  const emitNestedToolResult = async (
    event: CodeModeNestedToolResultEvent,
  ): Promise<void> => {
    await emitLifecycleHook('onNestedToolResult', event);
  };

  const emitInterrupt = async (interrupt: CodeModeInterrupt): Promise<void> => {
    const event: CodeModeInterruptEvent = {
      invocationId,
      outerToolCallId: baseExecutionOptions.toolCallId,
      interrupt,
    };
    await emitLifecycleHook('onInterrupt', event);
  };

  const emitLifecycleHook = async (
    hook:
      | 'onNestedToolCall'
      | 'onNestedToolResult'
      | 'onFetchRequest'
      | 'onFetchResult'
      | 'onInterrupt'
      | 'onTrace',
    event:
      | CodeModeNestedToolCallEvent
      | CodeModeNestedToolResultEvent
      | CodeModeFetchRequestEvent
      | CodeModeFetchResultEvent
      | CodeModeInterruptEvent
      | CodeModeTrace,
  ): Promise<void> => {
    const lifecycle = options?.lifecycle;
    const callback = lifecycle?.[hook];
    if (callback === undefined) {
      return;
    }
    try {
      await callback(event as never);
    } catch (error) {
      try {
        await lifecycle?.onHookError?.(error, { hook, event });
      } catch {
        // Hook failures are intentionally isolated from sandbox execution.
      }
    }
  };

  const emitFetchRequest = async (
    event: CodeModeFetchRequestEvent,
  ): Promise<void> => {
    await emitLifecycleHook('onFetchRequest', event);
  };

  const emitFetchResult = async (
    event: CodeModeFetchResultEvent,
  ): Promise<void> => {
    await emitLifecycleHook('onFetchResult', event);
  };

  const emitTrace = async (event: CodeModeTrace): Promise<void> => {
    await emitLifecycleHook('onTrace', event);
  };

  let traceFinishedPromise: Promise<void> | undefined;
  const finishTrace = (
    status: CodeModeTrace['status'],
    details: {
      error?: unknown;
      interruptedBy?: CodeModeInterrupt['type'];
    } = {},
  ): Promise<void> => {
    if (traceFinished) {
      return traceFinishedPromise ?? Promise.resolve();
    }
    traceFinished = true;
    const completedAtMs = Date.now();
    trace.status = status;
    trace.completedAtMs = completedAtMs;
    trace.durationMs = Math.max(0, completedAtMs - trace.startedAtMs);
    if (details.interruptedBy !== undefined) {
      trace.interruptedBy = details.interruptedBy;
      addTelemetryEvent(rootSpan, 'code_mode.interrupt', {
        'code_mode.interrupt.type': details.interruptedBy,
      });
    }
    if (details.error !== undefined) {
      trace.error = serializeError(details.error);
      recordTelemetryError(rootSpan, details.error);
    }
    rootSpan?.setAttributes?.({
      'code_mode.status': status,
      'code_mode.duration_ms': trace.durationMs,
      'code_mode.bridge_requests.count': trace.bridgeRequests.length,
      'code_mode.bridge_requests.replayed_count': trace.bridgeRequests.filter(
        entry => entry.replayed,
      ).length,
    });
    endTelemetrySpan(rootSpan);
    traceFinishedPromise = emitTrace(cloneTrace(trace));
    return traceFinishedPromise;
  };

  const makeToolCallEvent = ({
    bridgeIndex,
    toolName,
    input,
    inputJson,
    toolCallId,
    replayed,
    startedAtMs,
  }: {
    bridgeIndex: number;
    toolName: string;
    input: unknown;
    inputJson: string;
    toolCallId: string;
    replayed: boolean;
    startedAtMs: number;
  }): CodeModeNestedToolCallEvent => ({
    invocationId,
    outerToolCallId: baseExecutionOptions.toolCallId,
    bridgeIndex,
    toolName,
    input,
    inputBytes: byteLength(inputJson),
    toolCallId,
    replayed,
    startedAtMs,
  });

  const pushToolTrace = (
    event: CodeModeNestedToolResultEvent,
  ): CodeModeTraceEntry => {
    const entry: CodeModeTraceEntry = {
      kind: 'tool',
      bridgeIndex: event.bridgeIndex,
      toolName: event.toolName,
      toolCallId: event.toolCallId,
      status: event.status,
      replayed: event.replayed,
      startedAtMs: event.startedAtMs,
      completedAtMs: event.completedAtMs,
      durationMs: event.durationMs,
      inputBytes: event.inputBytes,
      ...(event.status === 'fulfilled'
        ? { outputBytes: event.outputBytes }
        : {}),
      ...(event.status === 'rejected'
        ? { error: toTraceError(event.error) }
        : {}),
      ...(event.status === 'interrupted'
        ? { interruptType: event.interrupt.type }
        : {}),
    };
    trace.bridgeRequests.push(entry);
    return entry;
  };

  const makeFetchRequestEvent = ({
    bridgeIndex,
    inputJson,
    request,
    replayed,
    startedAtMs,
  }: {
    bridgeIndex: number;
    inputJson: string;
    request: WorkerFetchRequest['request'];
    replayed: boolean;
    startedAtMs: number;
  }): CodeModeFetchRequestEvent => ({
    invocationId,
    outerToolCallId: baseExecutionOptions.toolCallId,
    bridgeIndex,
    url: request.url,
    method: request.method ?? 'GET',
    inputBytes: byteLength(inputJson),
    replayed,
    startedAtMs,
  });

  const pushFetchTrace = (
    event: CodeModeFetchResultEvent,
  ): CodeModeTraceEntry => {
    const entry: CodeModeTraceEntry = {
      kind: 'fetch',
      bridgeIndex: event.bridgeIndex,
      url: event.url,
      method: event.method,
      status: event.status,
      replayed: event.replayed,
      startedAtMs: event.startedAtMs,
      completedAtMs: event.completedAtMs,
      durationMs: event.durationMs,
      inputBytes: event.inputBytes,
      ...(event.status === 'fulfilled'
        ? { outputBytes: event.outputBytes }
        : {}),
      ...(event.status === 'rejected'
        ? { error: toTraceError(event.error) }
        : {}),
    };
    trace.bridgeRequests.push(entry);
    return entry;
  };

  const finishToolEvent = async (
    event: CodeModeNestedToolResultEvent,
  ): Promise<void> => {
    pushToolTrace(event);
    addTelemetryEvent(rootSpan, 'code_mode.nested_tool.result', {
      'code_mode.bridge.index': event.bridgeIndex,
      'code_mode.tool.name': event.toolName,
      'code_mode.tool_call.id': event.toolCallId,
      'code_mode.status': event.status,
      'code_mode.replayed': event.replayed,
      ...(event.status === 'fulfilled' &&
      options?.telemetry?.recordOutputs !== false
        ? { 'code_mode.tool.output.bytes': event.outputBytes }
        : {}),
    });
    await emitNestedToolResult(event);
  };

  const finishFetchEvent = async (
    event: CodeModeFetchResultEvent,
  ): Promise<void> => {
    pushFetchTrace(event);
    addTelemetryEvent(rootSpan, 'code_mode.fetch.result', {
      'code_mode.bridge.index': event.bridgeIndex,
      'code_mode.fetch.url': event.url,
      'code_mode.fetch.method': event.method,
      'code_mode.status': event.status,
      'code_mode.replayed': event.replayed,
      ...(event.status === 'fulfilled' &&
      options?.telemetry?.recordOutputs !== false
        ? { 'code_mode.fetch.output.bytes': event.outputBytes }
        : {}),
    });
    await emitFetchResult(event);
  };

  const startNestedToolSpan = (
    event: CodeModeNestedToolCallEvent,
  ): ReturnType<typeof startTelemetrySpan> =>
    startTelemetrySpan(options?.telemetry, 'ai.code_mode.nested_tool', {
      'code_mode.invocation.id': invocationId,
      'code_mode.outer_tool_call.id': baseExecutionOptions.toolCallId,
      'code_mode.bridge.index': event.bridgeIndex,
      'code_mode.tool.name': event.toolName,
      'code_mode.tool_call.id': event.toolCallId,
      'code_mode.replayed': event.replayed,
      ...(options?.telemetry?.recordInputs !== false
        ? { 'code_mode.tool.input.bytes': event.inputBytes }
        : {}),
    });

  const startFetchSpan = (
    event: CodeModeFetchRequestEvent,
  ): ReturnType<typeof startTelemetrySpan> =>
    startTelemetrySpan(options?.telemetry, 'ai.code_mode.fetch', {
      'code_mode.invocation.id': invocationId,
      'code_mode.outer_tool_call.id': baseExecutionOptions.toolCallId,
      'code_mode.bridge.index': event.bridgeIndex,
      'code_mode.fetch.url': event.url,
      'code_mode.fetch.method': event.method,
      'code_mode.replayed': event.replayed,
      ...(options?.telemetry?.recordInputs !== false
        ? { 'code_mode.fetch.input.bytes': event.inputBytes }
        : {}),
    });

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
    invocationContext.emitDestroy();
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
    void (async () => {
      await finishTrace('failed', { error });
      settleCaller(() => rejectResult(error));
    })();
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
      void handleReadyMessage(message);
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

    if (message.type === 'tool-request') {
      const bridgeIndex = markWorkerRequest(message);
      if (bridgeIndex !== undefined) {
        void handleToolRequest(message, bridgeIndex);
      }
      return;
    }

    if (message.type === 'fetch-request') {
      const bridgeIndex = markWorkerRequest(message);
      if (bridgeIndex !== undefined) {
        void handleFetchRequest(message, bridgeIndex);
      }
    }
  });

  const onError = bindInvocationContext((error: Error) => {
    failTerminal(error);
  });

  const onExit = bindInvocationContext((code: number) => {
    if (!terminalReached && code !== 0) {
      failTerminal(new Error(`Code mode worker exited with code ${code}.`));
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
      fetchEnabled: normalizedOptions.fetchEnabled,
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

  return { result, accountingDone };

  async function handleToolRequest(
    message: WorkerToolRequest,
    bridgeIndex: number,
  ): Promise<void> {
    const replayEntry = bridgeLedger[bridgeIndex - 1];
    const input = fromJsonPayload(message.inputJson);
    try {
      if (replayEntry !== undefined) {
        assertReplayEntryMatches(replayEntry, {
          kind: 'tool',
          name: message.toolName,
          inputJson: message.inputJson,
        });
        if (replayEntry.kind !== 'tool') {
          throw new CodeModeProtocolError(
            'Continuation replay expected a tool ledger entry.',
            { invocationId, bridgeIndex, kind: replayEntry.kind },
          );
        }

        if (replayEntry.status === 'fulfilled') {
          const startedAtMs = Date.now();
          const callEvent = makeToolCallEvent({
            bridgeIndex,
            toolName: message.toolName,
            input,
            inputJson: message.inputJson,
            toolCallId: replayEntry.toolCallId,
            replayed: true,
            startedAtMs,
          });
          await emitNestedToolCall(callEvent);
          const completedAtMs = Date.now();
          await finishToolEvent({
            ...callEvent,
            status: 'fulfilled',
            completedAtMs,
            durationMs: completedAtMs - startedAtMs,
            outputBytes: byteLength(replayEntry.valueJson),
            output: fromJsonPayload(replayEntry.valueJson),
          });
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
          const startedAtMs = Date.now();
          const callEvent = makeToolCallEvent({
            bridgeIndex,
            toolName: message.toolName,
            input,
            inputJson: message.inputJson,
            toolCallId: replayEntry.toolCallId,
            replayed: true,
            startedAtMs,
          });
          await emitNestedToolCall(callEvent);
          const completedAtMs = Date.now();
          await finishToolEvent({
            ...callEvent,
            status: 'rejected',
            completedAtMs,
            durationMs: completedAtMs - startedAtMs,
            error: replayEntry.error,
          });
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

        if (replayEntry.status === 'interrupted') {
          if (interruptResolution?.interruptId === replayEntry.interruptId) {
            interruptResolutionConsumed = true;
            const isApprovalInterrupt = isCodeModeApprovalInterruptPayload(
              replayEntry.interruptPayload,
            );

            // A built-in approval interrupt resolves to a boolean decision the
            // framework interprets here: deny rejects the call without running
            // the tool; approve runs the tool normally. A host-raised interrupt
            // forwards the resolution to the tool as `codeModeInterrupt`.
            if (isApprovalInterrupt) {
              const decision = normalizeApprovalResolution(
                interruptResolution.resolution,
              );
              if (!decision.approved) {
                const error = new CodeModeToolApprovalDeniedError(
                  replayEntry.name,
                  input,
                  replayEntry.toolCallId,
                  decision.reason,
                );
                const serialized = serializeError(error);
                const guestError = serializeBridgeErrorForGuest(error, 'tool');
                const dateNowMs = Date.now();
                bridgeLedger[bridgeIndex - 1] = {
                  kind: 'tool',
                  name: message.toolName,
                  inputJson: message.inputJson,
                  toolCallId: replayEntry.toolCallId,
                  status: 'rejected',
                  dateNowMs,
                  error: guestError,
                };
                await finishToolEvent({
                  invocationId,
                  outerToolCallId: baseExecutionOptions.toolCallId,
                  bridgeIndex,
                  toolName: message.toolName,
                  input,
                  inputBytes: byteLength(message.inputJson),
                  toolCallId: replayEntry.toolCallId,
                  replayed: false,
                  startedAtMs: dateNowMs,
                  status: 'rejected',
                  completedAtMs: dateNowMs,
                  durationMs: 0,
                  error: serialized,
                });
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

            const codeModeInterrupt:
              | CodeModeInterruptExecutionContext
              | undefined = isApprovalInterrupt
              ? undefined
              : {
                  interruptId: replayEntry.interruptId,
                  payload: replayEntry.interruptPayload,
                  resolution: interruptResolution.resolution,
                };
            const startedAtMs = Date.now();
            const callEvent = makeToolCallEvent({
              bridgeIndex,
              toolName: message.toolName,
              input,
              inputJson: message.inputJson,
              toolCallId: replayEntry.toolCallId,
              replayed: false,
              startedAtMs,
            });
            await emitNestedToolCall(callEvent);
            const toolSpan = startNestedToolSpan(callEvent);
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
            })
              .catch(error => {
                recordTelemetryError(toolSpan, error);
                throw error;
              })
              .finally(() => endTelemetrySpan(toolSpan));
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
            await finishToolEvent({
              ...callEvent,
              status: 'fulfilled',
              completedAtMs: dateNowMs,
              durationMs: dateNowMs - startedAtMs,
              outputBytes: byteLength(outcome.valueJson),
              output: fromJsonPayload(outcome.valueJson),
            });
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

          if (
            interruptResolution !== undefined &&
            interruptResolution.interruptId !== replayEntry.interruptId
          ) {
            // Parallel siblings can replay before the interrupt selected by
            // the caller. Keep this one pending while that resolution runs.
            requestInterrupt(bridgeIndex - 1);
            return;
          }

          requestInterrupt(bridgeIndex - 1);
          return;
        }

        return;
      }

      const toolCallId = `${baseExecutionOptions.toolCallId}:tool-${++nestedToolCounter}`;
      const startedAtMs = Date.now();
      const callEvent = makeToolCallEvent({
        bridgeIndex,
        toolName: message.toolName,
        input,
        inputJson: message.inputJson,
        toolCallId,
        replayed: false,
        startedAtMs,
      });
      await emitNestedToolCall(callEvent);
      const toolSpan = startNestedToolSpan(callEvent);
      const outcome = await invokeHostTool({
        toolName: message.toolName,
        inputJson: message.inputJson,
        tools,
        baseExecutionOptions,
        codeModeOptions: options ?? {},
        maxToolInputBytes: normalizedOptions.maxToolInputBytes,
        maxToolOutputBytes: normalizedOptions.maxToolOutputBytes,
        toolCallId,
      })
        .catch(error => {
          recordTelemetryError(toolSpan, error);
          throw error;
        })
        .finally(() => endTelemetrySpan(toolSpan));
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
      await finishToolEvent({
        ...callEvent,
        status: 'fulfilled',
        completedAtMs: dateNowMs,
        durationMs: dateNowMs - startedAtMs,
        outputBytes: byteLength(outcome.valueJson),
        output: fromJsonPayload(outcome.valueJson),
      });
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
      const serialized = serializeError(error);
      const guestError = serializeBridgeErrorForGuest(error, 'tool');
      const dateNowMs = Date.now();
      const toolCallId =
        replayEntry?.kind === 'tool'
          ? replayEntry.toolCallId
          : `${baseExecutionOptions.toolCallId}:tool-${nestedToolCounter}`;
      if (
        replayEntry?.kind === 'tool' &&
        replayEntry.status === 'interrupted' &&
        interruptResolution?.interruptId === replayEntry.interruptId
      ) {
        bridgeLedger[bridgeIndex - 1] = {
          kind: 'tool',
          name: message.toolName,
          inputJson: message.inputJson,
          toolCallId: replayEntry.toolCallId,
          status: 'rejected',
          dateNowMs,
          error: guestError,
        };
      } else if (replayEntry === undefined) {
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
      await finishToolEvent({
        invocationId,
        outerToolCallId: baseExecutionOptions.toolCallId,
        bridgeIndex,
        toolName: message.toolName,
        input,
        inputBytes: byteLength(message.inputJson),
        toolCallId,
        replayed: false,
        startedAtMs: dateNowMs,
        status: 'rejected',
        completedAtMs: dateNowMs,
        durationMs: 0,
        error: serialized,
      });
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
      settleAccountingIfDone();
    }
  }

  async function handleFetchRequest(
    message: WorkerFetchRequest,
    bridgeIndex: number,
  ): Promise<void> {
    const inputJson = JSON.stringify(message.request);
    const replayEntry = bridgeLedger[bridgeIndex - 1];
    try {
      if (replayEntry !== undefined) {
        assertReplayEntryMatches(replayEntry, {
          kind: 'fetch',
          name: message.request.url,
          inputJson,
        });
        if (replayEntry.kind !== 'fetch') {
          throw new CodeModeProtocolError(
            'Continuation replay expected a fetch ledger entry.',
            { invocationId, bridgeIndex, kind: replayEntry.kind },
          );
        }

        if (replayEntry.status === 'fulfilled') {
          const startedAtMs = Date.now();
          const requestEvent = makeFetchRequestEvent({
            bridgeIndex,
            inputJson,
            request: message.request,
            replayed: true,
            startedAtMs,
          });
          await emitFetchRequest(requestEvent);
          const completedAtMs = Date.now();
          await finishFetchEvent({
            ...requestEvent,
            status: 'fulfilled',
            completedAtMs,
            durationMs: completedAtMs - startedAtMs,
            outputBytes: byteLength(replayEntry.valueJson),
          });
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
          const startedAtMs = Date.now();
          const requestEvent = makeFetchRequestEvent({
            bridgeIndex,
            inputJson,
            request: message.request,
            replayed: true,
            startedAtMs,
          });
          await emitFetchRequest(requestEvent);
          const completedAtMs = Date.now();
          await finishFetchEvent({
            ...requestEvent,
            status: 'rejected',
            completedAtMs,
            durationMs: completedAtMs - startedAtMs,
            error: replayEntry.error,
          });
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

        throw new CodeModeProtocolError(
          'Continuation ledger entry for fetch cannot be interrupted.',
          { invocationId, requestId: message.requestId },
        );
      }

      const startedAtMs = Date.now();
      const requestEvent = makeFetchRequestEvent({
        bridgeIndex,
        inputJson,
        request: message.request,
        replayed: false,
        startedAtMs,
      });
      await emitFetchRequest(requestEvent);
      const fetchSpan = startFetchSpan(requestEvent);
      const response = await executeHostFetch({
        request: message.request,
        fetch: normalizedOptions.fetch,
        policy: normalizedOptions.fetchPolicy,
        signal: invocationAbortController.signal,
      })
        .catch(error => {
          recordTelemetryError(fetchSpan, error);
          throw error;
        })
        .finally(() => endTelemetrySpan(fetchSpan));
      const valueJson = toJsonPayload(
        response,
        normalizedOptions.maxResultBytes,
        'fetch response',
      );
      const dateNowMs = Date.now();
      bridgeLedger[bridgeIndex - 1] = {
        kind: 'fetch',
        name: message.request.url,
        inputJson,
        status: 'fulfilled',
        dateNowMs,
        valueJson,
      };
      await finishFetchEvent({
        ...requestEvent,
        status: 'fulfilled',
        completedAtMs: dateNowMs,
        durationMs: dateNowMs - startedAtMs,
        outputBytes: byteLength(valueJson),
      });
      postBridgeResponse({
        type: 'bridge-response',
        invocationId,
        requestId: message.requestId,
        success: true,
        dateNowMs,
        valueJson,
      });
    } catch (error) {
      if (error instanceof CodeModeProtocolError) {
        failTerminal(error);
        return;
      }
      const serialized = serializeError(error);
      const guestError = serializeBridgeErrorForGuest(error, 'fetch');
      const dateNowMs = Date.now();
      if (replayEntry === undefined) {
        bridgeLedger[bridgeIndex - 1] = {
          kind: 'fetch',
          name: message.request.url,
          inputJson,
          status: 'rejected',
          dateNowMs,
          error: guestError,
        };
      }
      await finishFetchEvent({
        invocationId,
        outerToolCallId: baseExecutionOptions.toolCallId,
        bridgeIndex,
        url: message.request.url,
        method: message.request.method ?? 'GET',
        inputBytes: byteLength(inputJson),
        replayed: false,
        startedAtMs: dateNowMs,
        status: 'rejected',
        completedAtMs: dateNowMs,
        durationMs: 0,
        error: serialized,
      });
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
      settleAccountingIfDone();
    }
  }

  function markWorkerRequest(
    message: WorkerToolRequest | WorkerFetchRequest,
  ): number | undefined {
    if (terminalReached) {
      return undefined;
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
      return undefined;
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
      return undefined;
    }

    seenWorkerRequestIds.add(message.requestId);

    if (totalBridgeRequests >= normalizedOptions.maxBridgeRequests) {
      const error = new CodeModeBridgeLimitError(
        `Code mode exceeded the maxBridgeRequests limit (${normalizedOptions.maxBridgeRequests}).`,
        {
          invocationId,
          requestId: message.requestId,
          maxBridgeRequests: normalizedOptions.maxBridgeRequests,
        },
      );
      postBridgeResponse({
        type: 'bridge-response',
        invocationId,
        requestId: message.requestId,
        success: false,
        dateNowMs: Date.now(),
        error: serializeBridgeErrorForGuest(error, 'bridge'),
      });
      return undefined;
    }

    if (inFlightBridgeRequests >= normalizedOptions.maxInFlightBridgeRequests) {
      const error = new CodeModeBridgeLimitError(
        `Code mode exceeded the maxInFlightBridgeRequests limit (${normalizedOptions.maxInFlightBridgeRequests}).`,
        {
          invocationId,
          requestId: message.requestId,
          maxInFlightBridgeRequests:
            normalizedOptions.maxInFlightBridgeRequests,
        },
      );
      postBridgeResponse({
        type: 'bridge-response',
        invocationId,
        requestId: message.requestId,
        success: false,
        dateNowMs: Date.now(),
        error: serializeBridgeErrorForGuest(error, 'bridge'),
      });
      return undefined;
    }

    totalBridgeRequests++;
    inFlightBridgeRequests++;
    return totalBridgeRequests;
  }

  function postBridgeResponse(message: MainToWorkerMessage): void {
    if (terminalReached || workerCleanedUp) {
      return;
    }
    try {
      // eslint-disable-next-line unicorn/require-post-message-target-origin -- Node.js Worker has no targetOrigin parameter.
      worker.postMessage(message);
    } catch (error) {
      failTerminal(error);
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

    // The acknowledgement shares the worker's outbound MessagePort with bridge
    // requests, so receiving it proves every request posted before this drain
    // barrier has reached the host.
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

    const entryIndex = interruptEntryIndex;
    const entry = bridgeLedger[entryIndex];
    if (entry === undefined || entry.kind !== 'tool') {
      failTerminal(
        new CodeModeProtocolError(
          'Code mode interruption references a missing tool ledger entry.',
          { invocationId, interruptEntryIndex },
        ),
      );
      return;
    }
    if (entry.status !== 'interrupted') {
      failTerminal(
        new CodeModeProtocolError(
          'Code mode interruption references a non-pending ledger entry.',
          { invocationId, interruptEntryIndex, status: entry.status },
        ),
      );
      return;
    }

    const continuation = signCodeModeContinuation(
      {
        version: 1 as const,
        js,
        outerToolCallId: baseExecutionOptions.toolCallId,
        determinism: { ...determinism },
        ledger: cloneLedger(bridgeLedger),
      },
      continuationSecurity,
    );

    const interrupt = createGenericInterrupt(entry, continuation);

    terminalReached = true;
    abortInvocation(interrupt);
    cleanupWorker(false);
    void (async () => {
      const completedAtMs = Date.now();
      const callEvent = makeToolCallEvent({
        bridgeIndex: entryIndex + 1,
        toolName: entry.name,
        input: fromJsonPayload(entry.inputJson),
        inputJson: entry.inputJson,
        toolCallId: entry.toolCallId,
        replayed: false,
        startedAtMs: completedAtMs,
      });
      await finishToolEvent({
        ...callEvent,
        status: 'interrupted',
        completedAtMs,
        durationMs: 0,
        interrupt,
      });
      await emitInterrupt(interrupt);
      await finishTrace('interrupted', { interruptedBy: interrupt.type });
      settleCaller(() => resolveResult(interrupt));
    })();
  }

  function createGenericInterrupt(
    entry: Extract<
      CodeModeContinuationLedgerEntry,
      { kind: 'tool'; status: 'interrupted' }
    >,
    continuation: CodeModeContinuation,
  ): CodeModeInterrupt {
    return {
      type: 'code-mode-interrupt',
      interruptId: entry.interruptId,
      toolName: entry.name,
      toolCallId: entry.toolCallId,
      outerToolCallId: continuation.outerToolCallId,
      input: fromJsonPayload(entry.inputJson),
      payload: structuredClone(entry.interruptPayload),
      continuation,
    };
  }

  async function handleReadyMessage(
    message: WorkerReadyMessage,
  ): Promise<void> {
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
      await finishTrace('failed', { error });
      settleCaller(() => rejectResult(error));
      return;
    }

    if (
      continuation !== undefined &&
      totalBridgeRequests < bridgeLedger.length
    ) {
      const error = new CodeModeProtocolError(
        'Code mode continuation returned before replaying the full bridge ledger.',
        {
          invocationId,
          replayedBridgeRequests: totalBridgeRequests,
          ledgerEntries: bridgeLedger.length,
          nextLedgerEntry: bridgeLedger[totalBridgeRequests],
        },
      );
      abortInvocation(error);
      cleanupWorker(false);
      await finishTrace('failed', { error });
      settleCaller(() => rejectResult(error));
      return;
    }

    if (!finalResultMessage.success) {
      await finishTrace('failed', {
        error: deserializeResultError(finalResultMessage),
      });
    } else {
      await finishTrace('completed');
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
    worker:
      configuredWorkerUrl === undefined
        ? new Worker(getInlineWorkerUrl(), { execArgv: [] })
        : new Worker(getCodeModeWorkerUrl()),
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

function normalizeWorkerUrl(workerUrl: CodeModeWorkerUrl): CodeModeWorkerUrl {
  if (typeof workerUrl !== 'string') {
    return workerUrl;
  }
  try {
    const url = new URL(workerUrl);
    return url.protocol === 'file:' || url.protocol === 'data:'
      ? url
      : workerUrl;
  } catch {
    return workerUrl;
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

function fromJsonPayload(valueJson: string): unknown {
  return valueJson === '' ? undefined : JSON.parse(valueJson);
}

function cloneLedger(
  ledger: CodeModeContinuationLedgerEntry[],
): CodeModeContinuationLedgerEntry[] {
  return ledger.map(entry => {
    switch (entry.status) {
      case 'fulfilled':
        return { ...entry };
      case 'rejected':
        return { ...entry, error: { ...entry.error } };
      case 'interrupted':
        return {
          ...entry,
          interruptPayload: structuredClone(entry.interruptPayload),
        };
      default: {
        const exhaustive: never = entry;
        return exhaustive;
      }
    }
  });
}

function assertReplayEntryMatches(
  entry: CodeModeContinuationLedgerEntry,
  request: {
    kind: 'tool' | 'fetch';
    name: string;
    inputJson: string;
  },
): void {
  if (
    entry.kind !== request.kind ||
    entry.name !== request.name ||
    entry.inputJson !== request.inputJson
  ) {
    throw new CodeModeProtocolError(
      'Code mode continuation replay diverged from the recorded bridge ledger.',
      {
        expected: {
          kind: entry.kind,
          name: entry.name,
          inputJson: entry.inputJson,
        },
        received: request,
      },
    );
  }
}

function assertDeterminismState(determinism: CodeModeDeterminismState): void {
  if (
    !Number.isFinite(determinism.dateNowMs) ||
    !Number.isInteger(determinism.dateNowMs)
  ) {
    throw new CodeModeProtocolError(
      'Code mode continuation determinism dateNowMs must be an integer.',
      { dateNowMs: determinism.dateNowMs },
    );
  }
  if (!/^[0-9a-f]{32}$/i.test(determinism.randomSeed)) {
    throw new CodeModeProtocolError(
      'Code mode continuation determinism randomSeed must be a 128-bit hex string.',
      { randomSeed: determinism.randomSeed },
    );
  }
}

function assertContinuationLedgerShape(
  continuation: CodeModeContinuation,
): void {
  const seenToolCallIds = new Set<string>();
  for (const [index, entry] of continuation.ledger.entries()) {
    if (entry.kind !== 'tool' && entry.kind !== 'fetch') {
      throw new CodeModeProtocolError(
        'Code mode continuation ledger entry has an unknown kind.',
        { index, kind: (entry as { kind?: unknown }).kind },
      );
    }
    if (typeof entry.name !== 'string') {
      throw new CodeModeProtocolError(
        'Code mode continuation ledger entry name must be a string.',
        { index, name: entry.name },
      );
    }
    assertJsonPayload(entry.inputJson, `ledger[${index}].inputJson`);

    if (entry.kind === 'fetch') {
      if (entry.status === 'fulfilled') {
        assertFiniteDateNow(entry.dateNowMs, index);
        assertJsonPayload(entry.valueJson, `ledger[${index}].valueJson`);
        continue;
      }
      if (entry.status === 'rejected') {
        assertFiniteDateNow(entry.dateNowMs, index);
        assertSerializableError(entry.error, index);
        continue;
      }
      throw new CodeModeProtocolError(
        'Fetch continuation ledger entry cannot be pending.',
        { index, status: (entry as { status?: unknown }).status },
      );
    }

    if (
      typeof entry.toolCallId !== 'string' ||
      !entry.toolCallId.startsWith(`${continuation.outerToolCallId}:tool-`)
    ) {
      throw new CodeModeProtocolError(
        'Tool continuation ledger entry has an unexpected toolCallId.',
        {
          index,
          toolCallId: entry.toolCallId,
          outerToolCallId: continuation.outerToolCallId,
        },
      );
    }
    if (seenToolCallIds.has(entry.toolCallId)) {
      throw new CodeModeProtocolError(
        'Tool continuation ledger contains a duplicate toolCallId.',
        { index, toolCallId: entry.toolCallId },
      );
    }
    seenToolCallIds.add(entry.toolCallId);

    switch (entry.status) {
      case 'fulfilled':
        assertFiniteDateNow(entry.dateNowMs, index);
        assertJsonPayload(entry.valueJson, `ledger[${index}].valueJson`);
        break;
      case 'rejected':
        assertFiniteDateNow(entry.dateNowMs, index);
        assertSerializableError(entry.error, index);
        break;
      case 'interrupted':
        if (entry.interruptId !== `${entry.toolCallId}:interrupt`) {
          throw new CodeModeProtocolError(
            'Generic interruption ledger entry has an unexpected interruptId.',
            {
              index,
              toolCallId: entry.toolCallId,
              interruptId: entry.interruptId,
            },
          );
        }
        if (
          typeof entry.interruptPayload !== 'object' ||
          entry.interruptPayload === null ||
          Array.isArray(entry.interruptPayload) ||
          typeof entry.interruptPayload.kind !== 'string' ||
          entry.interruptPayload.kind.length === 0
        ) {
          throw new CodeModeProtocolError(
            'Generic interruption ledger entry payload must include a string kind.',
            { index, interruptPayload: entry.interruptPayload },
          );
        }
        break;
      default:
        throw new CodeModeProtocolError(
          'Tool continuation ledger entry has an unknown status.',
          { index, status: (entry as { status?: unknown }).status },
        );
    }
  }
}

function assertJsonPayload(value: string, label: string): void {
  if (typeof value !== 'string') {
    throw new CodeModeProtocolError(`${label} must be a string.`, { value });
  }
  if (value === '') {
    return;
  }
  try {
    JSON.parse(value);
  } catch (error) {
    throw new CodeModeProtocolError(`${label} must be valid JSON.`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function assertFiniteDateNow(dateNowMs: number, index: number): void {
  if (!Number.isFinite(dateNowMs) || !Number.isInteger(dateNowMs)) {
    throw new CodeModeProtocolError(
      'Continuation ledger dateNowMs must be an integer.',
      { index, dateNowMs },
    );
  }
}

function assertSerializableError(error: unknown, index: number): void {
  const record = error as { name?: unknown; message?: unknown };
  if (
    typeof error !== 'object' ||
    error === null ||
    Array.isArray(error) ||
    typeof record.name !== 'string' ||
    typeof record.message !== 'string'
  ) {
    throw new CodeModeProtocolError(
      'Rejected continuation ledger entry has an invalid serialized error.',
      { index, error },
    );
  }
}

function getMaxNestedToolCounter(
  ledger: CodeModeContinuationLedgerEntry[],
): number {
  let max = 0;
  for (const entry of ledger) {
    if (entry.kind !== 'tool') {
      continue;
    }
    const match = /:tool-(\d+)$/.exec(entry.toolCallId);
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }
  return max;
}

function createDeterminismState(): CodeModeDeterminismState {
  return {
    dateNowMs: Date.now(),
    randomSeed: randomBytes(16).toString('hex'),
  };
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function toTraceError(error: unknown): SerializableError {
  if (isSerializableError(error)) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack !== undefined ? { stack: error.stack } : {}),
      ...(error.code !== undefined ? { code: error.code } : {}),
      ...(error.details !== undefined ? { details: error.details } : {}),
    };
  }
  return serializeError(error);
}

function isSerializableError(error: unknown): error is SerializableError {
  if (typeof error !== 'object' || error === null || Array.isArray(error)) {
    return false;
  }

  const record = error as {
    name?: unknown;
    message?: unknown;
    stack?: unknown;
    code?: unknown;
  };

  return (
    typeof record.name === 'string' &&
    typeof record.message === 'string' &&
    (record.stack === undefined || typeof record.stack === 'string') &&
    (record.code === undefined || typeof record.code === 'string')
  );
}

function cloneTrace(trace: CodeModeTrace): CodeModeTrace {
  return {
    ...trace,
    bridgeRequests: trace.bridgeRequests.map(entry => ({
      ...entry,
      ...(entry.error !== undefined ? { error: { ...entry.error } } : {}),
    })),
    ...(trace.error !== undefined ? { error: { ...trace.error } } : {}),
  };
}
