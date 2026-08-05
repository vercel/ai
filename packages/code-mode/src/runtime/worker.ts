import { writeSync } from 'node:fs';
import { formatWithOptions } from 'node:util';
import { parentPort } from 'node:worker_threads';
import {
  newQuickJSAsyncWASMModule,
  newVariant,
  type QuickJSAsyncContext,
  type QuickJSDeferredPromise,
  type QuickJSHandle,
  RELEASE_ASYNC,
} from 'quickjs-emscripten';
import { CodeModeProtocolError, serializeError } from '../errors.js';
import { assertJsonPayloadSize } from '../utils/serialization.js';
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
    resetDateNow?: QuickJSHandle;
  }
>();
let activeInvocationId: string | undefined;
let bridgeRequestCounter = 0;
let embeddedQuickJsWasmModulePromise: Promise<WebAssembly.Module> | undefined;

parentPort.on('message', (message: MainToWorkerMessage) => {
  if (message.type === 'bridge-drain') {
    if (message.invocationId !== activeInvocationId) {
      throw new CodeModeProtocolError(
        `Bridge drain invocationId mismatch: expected ${activeInvocationId ?? 'no active invocation'}, received ${message.invocationId}.`,
      );
    }
    parentPort?.postMessage({
      type: 'bridge-drained',
      invocationId: message.invocationId,
      drainId: message.drainId,
    });
    return;
  }

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
    resolveBridgeResponse(
      pending.context,
      pending.deferred,
      message,
      pending.resetDateNow,
    );
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
    const valueJson = await execute(message);
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

async function execute(message: WorkerRunMessage): Promise<string> {
  const context = await createQuickJSContext();
  const runtime = context.runtime;
  const deadline = Date.now() + message.options.timeoutMs;
  let interruptChecks = 0;
  let bridgeFunctions: { invokeTool: QuickJSHandle } | undefined;
  let determinismHandle: QuickJSHandle | undefined;
  let resetDateNowHandle: QuickJSHandle | undefined;

  runtime.setMemoryLimit(message.options.memoryLimitBytes);
  runtime.setMaxStackSize(message.options.maxStackSizeBytes);
  runtime.setInterruptHandler(() => {
    interruptChecks++;
    return interruptChecks > 10_000 || Date.now() > deadline;
  });

  try {
    installConsole(context, message.options.maxConsoleOutputBytes);
    bridgeFunctions = createBridgeFunctions(
      context,
      message,
      () => resetDateNowHandle,
    );
    determinismHandle = jsToHandle(context, message.determinism);
    const setupSource = buildGuestRuntimeSetupSource();
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
        determinismHandle,
      );
      if (setupCallResult.error) {
        const error = context.dump(setupCallResult.error);
        if (setupCallResult.error.alive) {
          setupCallResult.error.dispose();
        }
        throw toError(error);
      }
      if (setupCallResult.value.alive) {
        resetDateNowHandle = context.getProp(
          setupCallResult.value,
          'resetDateNow',
        );
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

    const valueJson = serializeQuickJSJsonPayload(
      context,
      resolvedResult.value,
    );
    if (resolvedResult.value.alive) {
      resolvedResult.value.dispose();
    }
    assertJsonPayloadSize(
      valueJson,
      message.options.maxResultBytes,
      'Code mode result',
    );
    return valueJson;
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
    if (determinismHandle?.alive) {
      determinismHandle.dispose();
    }
    if (resetDateNowHandle?.alive) {
      resetDateNowHandle.dispose();
    }
    context.dispose();
  }
}

async function createQuickJSContext(): Promise<QuickJSAsyncContext> {
  const embeddedWasmBase64 = getEmbeddedQuickJsWasmBase64();
  if (embeddedWasmBase64 !== undefined) {
    const variant = newVariant(RELEASE_ASYNC, {
      wasmModule: () => getEmbeddedQuickJsWasmModule(embeddedWasmBase64),
    });
    return (await newQuickJSAsyncWASMModule(variant)).newContext();
  }

  return (await newQuickJSAsyncWASMModule(RELEASE_ASYNC)).newContext();
}

function getEmbeddedQuickJsWasmBase64(): string | undefined {
  return (
    globalThis as typeof globalThis & {
      __CODE_MODE_QUICKJS_WASM_BASE64__?: unknown;
    }
  ).__CODE_MODE_QUICKJS_WASM_BASE64__ as string | undefined;
}

function getEmbeddedQuickJsWasmModule(
  wasmBase64: string,
): Promise<WebAssembly.Module> {
  embeddedQuickJsWasmModulePromise ??= WebAssembly.compile(
    decodeBase64ArrayBuffer(wasmBase64),
  );
  return embeddedQuickJsWasmModulePromise;
}

function decodeBase64ArrayBuffer(value: string): ArrayBuffer {
  const bytes = Buffer.from(value, 'base64');
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer as ArrayBuffer;
}

function serializeQuickJSJsonPayload(
  context: QuickJSAsyncContext,
  value: QuickJSHandle,
): string {
  const serialize = context.getProp(
    context.global,
    '__codeModeSerializeJsonPayload',
  );
  try {
    const result = context.callFunction(serialize, context.undefined, value);
    if (result.error) {
      const error = context.dump(result.error);
      if (result.error.alive) {
        result.error.dispose();
      }
      throw toError(error);
    }
    const valueJson = context.getString(result.value);
    if (result.value.alive) {
      result.value.dispose();
    }
    return valueJson;
  } finally {
    if (serialize.alive) {
      serialize.dispose();
    }
  }
}

function installConsole(
  context: QuickJSAsyncContext,
  maxOutputBytes: number,
): void {
  const outputBudget = { remainingBytes: maxOutputBytes };
  const consoleHandle = context.newObject();
  const handles = [
    ['log', createConsoleFunction(context, 'stdout', outputBudget)],
    ['info', createConsoleFunction(context, 'stdout', outputBudget)],
    ['debug', createConsoleFunction(context, 'stdout', outputBudget)],
    ['error', createConsoleFunction(context, 'stderr', outputBudget)],
  ] as const;

  for (const [name, handle] of handles) {
    context.setProp(consoleHandle, name, handle);
  }
  context.setProp(context.global, 'console', consoleHandle);

  for (const [, handle] of handles) {
    handle.dispose();
  }
  consoleHandle.dispose();
}

function createConsoleFunction(
  context: QuickJSAsyncContext,
  stream: 'stdout' | 'stderr',
  outputBudget: { remainingBytes: number },
): QuickJSHandle {
  return context.newFunction('console', (...args: QuickJSHandle[]) => {
    if (outputBudget.remainingBytes === 0) {
      return;
    }
    const values = args.map(arg => dumpConsoleArg(context, arg));
    const line = formatWithOptions({ colors: false, depth: 4 }, ...values);
    const output = `${line}\n`;
    const outputBytes = Buffer.byteLength(output);
    if (outputBytes > outputBudget.remainingBytes) {
      outputBudget.remainingBytes = 0;
      return;
    }
    outputBudget.remainingBytes -= outputBytes;
    writeSync(stream === 'stderr' ? 2 : 1, output);
  });
}

function dumpConsoleArg(
  context: QuickJSAsyncContext,
  arg: QuickJSHandle,
): unknown {
  try {
    return context.dump(arg);
  } catch {
    return '[Unprintable QuickJS value]';
  }
}

function createBridgeFunctions(
  context: QuickJSAsyncContext,
  message: WorkerRunMessage,
  getResetDateNow: () => QuickJSHandle | undefined,
): { invokeTool: QuickJSHandle } {
  const invokeTool = context.newFunction(
    '__codeModeInvokeTool',
    (toolNameHandle: QuickJSHandle, inputJsonHandle: QuickJSHandle) => {
      const toolName = context.getString(toolNameHandle);
      const inputJson = context.getString(inputJsonHandle);
      return requestHost(
        context,
        message.invocationId,
        { toolName, inputJson },
        getResetDateNow(),
      );
    },
  );

  return { invokeTool };
}

function requestHost(
  context: QuickJSAsyncContext,
  invocationId: string,
  payload: Record<string, unknown>,
  resetDateNow: QuickJSHandle | undefined,
): QuickJSHandle {
  const requestId = `${invocationId}:bridge-${++bridgeRequestCounter}`;
  const deferred = context.newPromise();
  pendingBridgeRequests.set(requestId, {
    context,
    deferred,
    invocationId,
    ...(resetDateNow !== undefined ? { resetDateNow } : {}),
  });
  deferred.settled.then(() => {
    context.runtime.executePendingJobs();
    deferred.dispose();
  });
  parentPort?.postMessage({
    type: 'tool-request',
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
  resetDateNow?: QuickJSHandle,
): void {
  resetGuestDateNow(context, resetDateNow, message.dateNowMs);
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

function resetGuestDateNow(
  context: QuickJSAsyncContext,
  resetDateNow: QuickJSHandle | undefined,
  dateNowMs: number,
): void {
  if (resetDateNow === undefined) {
    return;
  }
  const value = context.newNumber(dateNowMs);
  try {
    const result = context.callFunction(resetDateNow, context.undefined, value);
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
    value.dispose();
  }
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
