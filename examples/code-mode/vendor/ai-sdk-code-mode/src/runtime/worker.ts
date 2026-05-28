import { parentPort } from 'node:worker_threads';
import {
  newAsyncContext,
  type QuickJSAsyncContext,
  type QuickJSDeferredPromise,
  type QuickJSHandle,
} from 'quickjs-emscripten';
import { CodeModeProtocolError, serializeError } from '../errors.js';
import { assertJsonSerializable, toJsonPayload } from '../serialization.js';
import { buildGuestRuntimeSetupSource, wrapUserCode } from './guest-sources.js';
import type {
  MainToWorkerMessage,
  WorkerBridgeResponse,
  WorkerRunMessage,
} from './protocol.js';

if (!parentPort) {
  throw new Error('code-mode worker must run inside a worker thread');
}

const pendingBridgeRequests = new Map<
  string,
  {
    context: QuickJSAsyncContext;
    deferred: QuickJSDeferredPromise;
    invocationId: string;
  }
>();
let activeInvocationId: string | undefined;
let bridgeRequestCounter = 0;

parentPort.on('message', (message: MainToWorkerMessage) => {
  if (message.type === 'bridge-response') {
    const pending = pendingBridgeRequests.get(message.requestId);
    if (!pending) {
      throw new CodeModeProtocolError(
        `Unexpected bridge response requestId: ${message.requestId}.`,
        {
          invocationId: message.invocationId,
          requestId: message.requestId,
        },
      );
    }

    if (pending.invocationId !== message.invocationId) {
      throw new CodeModeProtocolError(
        `Bridge response invocationId mismatch for request ${message.requestId}: expected ${pending.invocationId}, received ${message.invocationId}.`,
        {
          expectedInvocationId: pending.invocationId,
          receivedInvocationId: message.invocationId,
          requestId: message.requestId,
        },
      );
    }

    pendingBridgeRequests.delete(message.requestId);
    resolveBridgeResponse(pending.context, pending.deferred, message);
    return;
  }

  if (message.type === 'run') {
    if (activeInvocationId !== undefined) {
      throw new CodeModeProtocolError(
        `Worker received run ${message.invocationId} while ${activeInvocationId} is still active.`,
        {
          activeInvocationId,
          receivedInvocationId: message.invocationId,
        },
      );
    }

    activeInvocationId = message.invocationId;
    void run(message).finally(() => {
      activeInvocationId = undefined;
    });
  }
});

async function run(message: WorkerRunMessage): Promise<void> {
  try {
    const value = await execute(message);
    const valueJson = toJsonPayload(
      value,
      message.options.maxResultBytes,
      'Code mode result',
    );
    parentPort?.postMessage({
      type: 'result',
      invocationId: message.invocationId,
      success: true,
      valueJson,
    });
  } catch (error) {
    parentPort?.postMessage({
      type: 'result',
      invocationId: message.invocationId,
      success: false,
      error: serializeError(error),
    });
  } finally {
    parentPort?.postMessage({
      type: 'ready',
      invocationId: message.invocationId,
    });
  }
}

async function execute(message: WorkerRunMessage): Promise<unknown> {
  const context = await newAsyncContext();
  const runtime = context.runtime;
  const deadline = Date.now() + message.options.timeoutMs;
  let interruptChecks = 0;
  let bridgeFunctions:
    | { invokeTool: QuickJSHandle; fetch?: QuickJSHandle }
    | undefined;

  runtime.setMemoryLimit(message.options.memoryLimitBytes);
  runtime.setMaxStackSize(message.options.maxStackSizeBytes);
  runtime.setInterruptHandler(() => {
    interruptChecks++;
    return interruptChecks > 10_000 || Date.now() > deadline;
  });

  try {
    bridgeFunctions = createBridgeFunctions(context, message);
    const setupSource = buildGuestRuntimeSetupSource(
      message.options.fetchEnabled,
    );
    const setupEvalResult = await context.evalCodeAsync(
      setupSource,
      'code-mode-setup.js',
    );
    if (setupEvalResult.error) {
      const error = context.dump(setupEvalResult.error);
      if (setupEvalResult.error.alive) {
        setupEvalResult.error.dispose();
      }
      throw toError(error);
    }
    try {
      const setupCallResult = context.callFunction(
        setupEvalResult.value,
        context.undefined,
        bridgeFunctions.invokeTool,
        bridgeFunctions.fetch ?? context.undefined,
      );
      if (setupCallResult.error) {
        const error = context.dump(setupCallResult.error);
        if (setupCallResult.error.alive) {
          setupCallResult.error.dispose();
        }
        throw toError(error);
      }
      if (setupCallResult.value.alive) {
        setupCallResult.value.dispose();
      }
    } finally {
      if (setupEvalResult.value.alive) {
        setupEvalResult.value.dispose();
      }
    }

    const wrapped = wrapUserCode(message.js);
    const evalResult = await context.evalCodeAsync(wrapped, 'code-mode.js');

    if (evalResult.error) {
      const error = context.dump(evalResult.error);
      if (evalResult.error.alive) {
        evalResult.error.dispose();
      }
      throw toError(error);
    }

    if (evalResult.value.alive) {
      evalResult.value.dispose();
    }

    const promiseHandle = context.getProp(context.global, '__codeModeResult');
    const resolvedResult = await resolveQuickJSPromise(context, promiseHandle);
    if (promiseHandle.alive) {
      promiseHandle.dispose();
    }

    if (resolvedResult.error) {
      const error = context.dump(resolvedResult.error);
      if (resolvedResult.error.alive) {
        resolvedResult.error.dispose();
      }
      throw toError(error);
    }

    assertQuickJSJsonSerializable(context, resolvedResult.value);

    const value = context.dump(resolvedResult.value);
    if (resolvedResult.value.alive) {
      resolvedResult.value.dispose();
    }
    assertJsonSerializable(
      value,
      message.options.maxResultBytes,
      'Code mode result',
    );
    return value;
  } finally {
    for (const pending of pendingBridgeRequests.values()) {
      const error = pending.context.newError(
        'Worker execution finished before bridge response',
      );
      pending.deferred.reject(error);
      error.dispose();
    }
    pendingBridgeRequests.clear();
    if (bridgeFunctions?.invokeTool.alive) {
      bridgeFunctions.invokeTool.dispose();
    }
    if (bridgeFunctions?.fetch?.alive) {
      bridgeFunctions.fetch.dispose();
    }
    context.dispose();
  }
}

function assertQuickJSJsonSerializable(
  context: QuickJSAsyncContext,
  value: QuickJSHandle,
): void {
  const guard = context.getProp(context.global, '__codeModeAssertSerializable');
  try {
    const result = context.callFunction(guard, context.undefined, value);
    if (result.error) {
      const error = context.dump(result.error);
      if (result.error.alive) {
        result.error.dispose();
      }
      throw toError(error);
    }
    if (result.value.alive) {
      result.value.dispose();
    }
  } finally {
    if (guard.alive) {
      guard.dispose();
    }
  }
}

function createBridgeFunctions(
  context: QuickJSAsyncContext,
  message: WorkerRunMessage,
): { invokeTool: QuickJSHandle; fetch?: QuickJSHandle } {
  const invokeTool = context.newFunction(
    '__codeModeInvokeTool',
    (toolNameHandle: QuickJSHandle, inputJsonHandle: QuickJSHandle) => {
      const toolName = context.getString(toolNameHandle);
      const inputJson = context.getString(inputJsonHandle);
      return requestHost(context, message.invocationId, 'tool-request', {
        toolName,
        inputJson,
      });
    },
  );

  if (message.options.fetchEnabled) {
    const fetchFunction = context.newFunction(
      '__codeModeFetch',
      (requestJsonHandle: QuickJSHandle) => {
        const requestJson = context.getString(requestJsonHandle);
        return requestHost(context, message.invocationId, 'fetch-request', {
          request: JSON.parse(requestJson),
        });
      },
    );
    return { invokeTool, fetch: fetchFunction };
  }
  return { invokeTool };
}

function requestHost(
  context: QuickJSAsyncContext,
  invocationId: string,
  type: 'tool-request' | 'fetch-request',
  payload: Record<string, unknown>,
): QuickJSHandle {
  const requestId = `${invocationId}:bridge-${++bridgeRequestCounter}`;
  const deferred = context.newPromise();
  pendingBridgeRequests.set(requestId, { context, deferred, invocationId });
  deferred.settled.then(() => {
    context.runtime.executePendingJobs();
    deferred.dispose();
  });
  parentPort?.postMessage({
    type,
    invocationId,
    requestId,
    ...payload,
  });
  return deferred.handle;
}

function resolveBridgeResponse(
  context: QuickJSAsyncContext,
  deferred: QuickJSDeferredPromise,
  message: WorkerBridgeResponse,
): void {
  if (message.success) {
    const value = context.newString(message.valueJson ?? '');
    deferred.resolve(value);
    value.dispose();
    return;
  }
  const error = createBridgeErrorHandle(context, message.error);
  deferred.reject(error);
  error.dispose();
}

function drainPendingJobs(context: QuickJSAsyncContext): void {
  while (context.runtime.hasPendingJob()) {
    const pending = context.runtime.executePendingJobs();
    if ('error' in pending && pending.error) {
      const contextForError =
        'context' in pending.error ? pending.error.context : context;
      const error = contextForError.dump(pending.error);
      if (pending.error.alive) {
        pending.error.dispose();
      }
      throw toError(error);
    }
  }
}

async function resolveQuickJSPromise(
  context: QuickJSAsyncContext,
  promiseHandle: QuickJSHandle,
) {
  const resolved = context.resolvePromise(promiseHandle);
  for (;;) {
    drainPendingJobs(context);
    const result = await Promise.race([
      resolved.then(value => ({ settled: true as const, value })),
      new Promise<{ settled: false }>(resolve =>
        setTimeout(() => resolve({ settled: false }), 0),
      ),
    ]);
    if (result.settled) {
      drainPendingJobs(context);
      return result.value;
    }
  }
}

function toError(value: unknown): Error {
  if (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof (value as { message?: unknown }).message === 'string'
  ) {
    const errorValue = value as {
      message: string;
      name?: string;
      stack?: string;
      code?: string;
      details?: unknown;
    };
    const error = new Error(errorValue.message);
    if (
      'name' in value &&
      typeof (value as { name?: unknown }).name === 'string'
    ) {
      error.name = errorValue.name!;
    }
    if (
      'stack' in value &&
      typeof (value as { stack?: unknown }).stack === 'string'
    ) {
      error.stack = (value as { stack: string }).stack;
    }
    if (errorValue.code !== undefined) {
      Object.defineProperty(error, 'code', {
        value: errorValue.code,
        enumerable: true,
      });
    }
    if (errorValue.details !== undefined) {
      Object.defineProperty(error, 'details', {
        value: errorValue.details,
        enumerable: true,
      });
    }
    return error;
  }
  return new Error(String(value));
}

function createBridgeErrorHandle(
  context: QuickJSAsyncContext,
  error: WorkerBridgeResponse['error'],
): QuickJSHandle {
  const handle = context.newError(
    error?.message ?? 'Host bridge request failed.',
  );
  if (!error) {
    return handle;
  }
  const name = context.newString(error.name);
  context.setProp(handle, 'name', name);
  name.dispose();
  if (error.code !== undefined) {
    const code = context.newString(error.code);
    context.setProp(handle, 'code', code);
    code.dispose();
  }
  if (error.details !== undefined) {
    const details = jsToHandle(context, error.details);
    context.setProp(handle, 'details', details);
    details.dispose();
  }
  return handle;
}

function jsToHandle(
  context: QuickJSAsyncContext,
  value: unknown,
): QuickJSHandle {
  if (value === null || value === undefined) {
    return context.undefined;
  }
  if (typeof value === 'string') {
    return context.newString(value);
  }
  if (typeof value === 'number') {
    return context.newNumber(value);
  }
  if (typeof value === 'boolean') {
    return value ? context.true : context.false;
  }
  if (Array.isArray(value)) {
    const array = context.newArray();
    value.forEach((item, index) => {
      const itemHandle = jsToHandle(context, item);
      context.setProp(array, index, itemHandle);
      itemHandle.dispose();
    });
    return array;
  }
  if (typeof value === 'object') {
    const object = context.newObject();
    for (const [key, item] of Object.entries(
      value as Record<string, unknown>,
    )) {
      const itemHandle = jsToHandle(context, item);
      context.setProp(object, key, itemHandle);
      itemHandle.dispose();
    }
    return object;
  }
  return context.undefined;
}
