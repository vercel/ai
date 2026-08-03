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
import {
  RunProtocolError,
  RunTimeoutError,
  serializeError,
} from '../errors.js';
import { assertJsonPayloadSize } from '../utils/serialization.js';
import { parseJson } from '../utils/parse-json.js';
import { buildGuestRuntimeSetupSource, wrapUserCode } from './guest-sources.js';
import { normalizeUserSourceStack } from './source-stack.js';
import type { WorkerBridgeResponse, WorkerRunMessage } from './protocol.js';
import { assertMainToWorkerMessage } from './protocol-validation.js';

if (!parentPort) {
  throw new Error('JavaScript runtime worker must run inside a worker thread');
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
let bridgeIdleGeneration = 0;
let embeddedQuickJsWasmModulePromise: Promise<WebAssembly.Module> | undefined;
let activeCancellation:
  | { invocationId: string; cancel: () => void }
  | undefined;

parentPort.on('message', (value: unknown) => {
  assertMainToWorkerMessage(value);
  const message = value;
  if (message.type === 'cancel') {
    if (
      activeInvocationId !== message.invocationId ||
      activeCancellation?.invocationId !== message.invocationId
    ) {
      throw new RunProtocolError(
        `Worker received cancellation for inactive invocation ${message.invocationId}.`,
      );
    }
    activeCancellation.cancel();
    return;
  }
  if (message.type === 'bridge-response') {
    const pending = pendingBridgeRequests.get(message.requestId);
    if (!pending) {
      throw new RunProtocolError(
        `Unexpected bridge response requestId: ${message.requestId}.`,
        {
          invocationId: message.invocationId,
          requestId: message.requestId,
        },
      );
    }

    if (pending.invocationId !== message.invocationId) {
      throw new RunProtocolError(
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
      throw new RunProtocolError(
        `Worker received run ${message.invocationId} while ${activeInvocationId} is still active.`,
        {
          activeInvocationId,
          receivedInvocationId: message.invocationId,
        },
      );
    }

    activeInvocationId = message.invocationId;
    bridgeRequestCounter = 0;
    bridgeIdleGeneration++;
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
    bridgeIdleGeneration++;
    parentPort?.postMessage({
      type: 'ready',
      invocationId: message.invocationId,
    });
  }
}

async function execute(message: WorkerRunMessage): Promise<string> {
  const context = await createQuickJSContext();
  const runtime = context.runtime;
  const deadline = Date.now() + message.options.executionTimeoutMs;
  let interruptChecks = 0;
  let bridgeFunctions: { invokeBinding: QuickJSHandle } | undefined;
  let consoleFormatter: QuickJSHandle | undefined;
  let determinismHandle: QuickJSHandle | undefined;
  let resetDateNowHandle: QuickJSHandle | undefined;
  let cancelled = false;
  let executionTimedOut = false;

  runtime.setMemoryLimit(message.options.memoryLimitBytes);
  runtime.setMaxStackSize(message.options.maxStackSizeBytes);
  runtime.setInterruptHandler(() => {
    interruptChecks++;
    const timedOut = interruptChecks > 10_000 || Date.now() > deadline;
    executionTimedOut ||= timedOut;
    return cancelled || timedOut;
  });
  activeCancellation = {
    invocationId: message.invocationId,
    cancel: () => {
      cancelled = true;
      rejectPendingBridgeRequests(
        context,
        message.invocationId,
        'Worker execution cancelled by host',
      );
    },
  };

  try {
    consoleFormatter = installConsole(
      context,
      message.options.maxConsoleOutputBytes,
    );
    bridgeFunctions = createBridgeFunctions(
      context,
      message,
      () => resetDateNowHandle,
    );
    determinismHandle = jsToHandle(context, message.determinism);
    const setupSource = buildGuestRuntimeSetupSource(message.bindingNamespaces);
    const setupEvalResult = await context.evalCodeAsync(
      setupSource,
      'run-setup.js',
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
        bridgeFunctions.invokeBinding,
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

    const wrapped = wrapUserCode(message.source);
    const evalResult = await context.evalCodeAsync(wrapped, 'run.js');

    if (evalResult.error) {
      const error = context.dump(evalResult.error);
      if (evalResult.error.alive) {
        evalResult.error.dispose();
      }
      throw toUserSourceError(error, message.source);
    }

    if (evalResult.value.alive) {
      evalResult.value.dispose();
    }

    const promiseHandle = context.getProp(context.global, '__runResult');
    const resolvedResult = await resolveQuickJSPromise(context, promiseHandle);
    if (promiseHandle.alive) {
      promiseHandle.dispose();
    }

    if (resolvedResult.error) {
      const error = context.dump(resolvedResult.error);
      if (resolvedResult.error.alive) {
        resolvedResult.error.dispose();
      }
      throw toUserSourceError(error, message.source);
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
      'JavaScript runtime result',
    );
    return valueJson;
  } catch (error) {
    if (executionTimedOut) {
      throw new RunTimeoutError(message.options.timeoutMs);
    }
    throw error;
  } finally {
    if (activeCancellation?.invocationId === message.invocationId) {
      activeCancellation = undefined;
    }
    if (!cancelled) {
      rejectPendingBridgeRequests(
        context,
        message.invocationId,
        'Worker execution finished before bridge response',
      );
    }
    const pendingForInvocation = [...pendingBridgeRequests.entries()].filter(
      ([, pending]) => pending.invocationId === message.invocationId,
    );
    await Promise.allSettled(
      pendingForInvocation.map(([, pending]) => pending.deferred.settled),
    );
    for (const [requestId] of pendingForInvocation) {
      pendingBridgeRequests.delete(requestId);
    }
    if (bridgeFunctions?.invokeBinding.alive) {
      bridgeFunctions.invokeBinding.dispose();
    }
    if (consoleFormatter?.alive) consoleFormatter.dispose();
    if (resetDateNowHandle?.alive) resetDateNowHandle.dispose();
    if (determinismHandle?.alive) determinismHandle.dispose();
    context.dispose();
  }
}

function rejectPendingBridgeRequests(
  context: QuickJSAsyncContext,
  invocationId: string,
  message: string,
): void {
  for (const pending of pendingBridgeRequests.values()) {
    if (pending.invocationId !== invocationId) continue;
    const error = context.newError(message);
    pending.deferred.reject(error);
    error.dispose();
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
      __RUN_QUICKJS_WASM_BASE64__?: unknown;
    }
  ).__RUN_QUICKJS_WASM_BASE64__ as string | undefined;
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
    '__runSerializeJsonPayload',
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
): QuickJSHandle {
  const outputBudget = { remainingBytes: maxOutputBytes };
  const formatterResult = context.evalCode(`
    (value, maxChars) => {
      let rendered;
      try {
        rendered = typeof value === 'string' ? value : JSON.stringify(value);
      } catch {}
      return String(rendered === undefined ? value : rendered)
      .slice(0, maxChars)
      .replace(/[\\u0000-\\u001f\\u007f-\\u009f]/gu, character =>
        character === '\\t'
          ? '\\t'
          : '\\\\u' + character.charCodeAt(0).toString(16).padStart(4, '0')
      );
    }
  `);
  if (formatterResult.error) {
    const error = context.dump(formatterResult.error);
    formatterResult.error.dispose();
    throw toError(error);
  }
  const boundedFormatter = formatterResult.value;
  const consoleHandle = context.newObject();
  const handles = [
    [
      'log',
      createConsoleFunction(context, 'stdout', outputBudget, boundedFormatter),
    ],
    [
      'info',
      createConsoleFunction(context, 'stdout', outputBudget, boundedFormatter),
    ],
    [
      'debug',
      createConsoleFunction(context, 'stdout', outputBudget, boundedFormatter),
    ],
    [
      'error',
      createConsoleFunction(context, 'stderr', outputBudget, boundedFormatter),
    ],
  ] as const;

  for (const [name, handle] of handles) {
    context.setProp(consoleHandle, name, handle);
  }
  context.setProp(context.global, 'console', consoleHandle);

  for (const [, handle] of handles) {
    handle.dispose();
  }
  consoleHandle.dispose();
  return boundedFormatter;
}

function createConsoleFunction(
  context: QuickJSAsyncContext,
  stream: 'stdout' | 'stderr',
  outputBudget: { remainingBytes: number },
  boundedFormatter: QuickJSHandle,
): QuickJSHandle {
  return context.newFunction('console', (...args: QuickJSHandle[]) => {
    if (outputBudget.remainingBytes === 0) {
      return;
    }
    const maxBytesPerArgument = Math.max(
      1,
      Math.floor(outputBudget.remainingBytes / Math.max(1, args.length)),
    );
    const values = args.map(arg =>
      formatConsoleArg(context, boundedFormatter, arg, maxBytesPerArgument),
    );
    const line = formatWithOptions({ colors: false, depth: 0 }, ...values);
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

function formatConsoleArg(
  context: QuickJSAsyncContext,
  boundedFormatter: QuickJSHandle,
  arg: QuickJSHandle,
  remainingBytes: number,
): string {
  const maxCharsHandle = context.newNumber(remainingBytes);
  try {
    const result = context.callFunction(
      boundedFormatter,
      context.undefined,
      arg,
      maxCharsHandle,
    );
    if (result.error) {
      result.error.dispose();
      return '[Unprintable QuickJS value]';
    }
    const value = context.getString(result.value);
    result.value.dispose();
    if (context.typeof(arg) === 'object') {
      try {
        return formatWithOptions({ colors: false, depth: 4 }, parseJson(value));
      } catch {
        // A bounded/truncated JSON preview is still safe to print as text.
      }
    }
    return value;
  } catch {
    return '[Unprintable QuickJS value]';
  } finally {
    maxCharsHandle.dispose();
  }
}

function createBridgeFunctions(
  context: QuickJSAsyncContext,
  message: WorkerRunMessage,
  getResetDateNow: () => QuickJSHandle | undefined,
): { invokeBinding: QuickJSHandle } {
  const invokeBinding = context.newFunction(
    '__runInvokeBinding',
    (bindingNameHandle: QuickJSHandle, inputJsonHandle: QuickJSHandle) => {
      const bindingName = context.getString(bindingNameHandle);
      const inputJson = context.getString(inputJsonHandle);
      if (Buffer.byteLength(bindingName) > 1024) {
        return { error: context.newError('Binding name exceeds 1024 bytes.') };
      }
      if (Buffer.byteLength(inputJson) > message.options.maxBindingInputBytes) {
        return {
          error: context.newError(
            `Binding arguments exceed the ${message.options.maxBindingInputBytes} byte size limit.`,
          ),
        };
      }
      return requestHost(
        context,
        message.invocationId,
        {
          bindingName,
          inputJson,
        },
        getResetDateNow(),
      );
    },
  );

  return { invokeBinding };
}

function requestHost(
  context: QuickJSAsyncContext,
  invocationId: string,
  payload: Record<string, unknown>,
  resetDateNow?: QuickJSHandle,
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
    type: 'binding-request',
    invocationId,
    requestId,
    ...payload,
  });
  const idleGeneration = ++bridgeIdleGeneration;
  setImmediate(() => {
    if (idleGeneration === bridgeIdleGeneration) {
      parentPort?.postMessage({
        type: 'bridge-idle',
        invocationId,
        requestCount: bridgeRequestCounter,
      });
    }
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
  if (resetDateNow === undefined) return;
  const value = context.newNumber(dateNowMs);
  try {
    const result = context.callFunction(resetDateNow, context.undefined, value);
    if (result.error) {
      const error = context.dump(result.error);
      if (result.error.alive) result.error.dispose();
      throw toError(error);
    }
    if (result.value.alive) result.value.dispose();
  } finally {
    value.dispose();
  }
}

function jsToHandle(
  context: QuickJSAsyncContext,
  value: unknown,
): QuickJSHandle {
  if (value === null) return context.null;
  if (typeof value === 'string') return context.newString(value);
  if (typeof value === 'number') return context.newNumber(value);
  if (typeof value === 'boolean') return value ? context.true : context.false;
  if (Array.isArray(value)) {
    const result = context.newArray();
    for (const [index, item] of value.entries()) {
      const handle = jsToHandle(context, item);
      context.setProp(result, index, handle);
      handle.dispose();
    }
    return result;
  }
  if (typeof value === 'object') {
    const result = context.newObject();
    for (const [key, item] of Object.entries(value)) {
      const handle = jsToHandle(context, item);
      context.setProp(result, key, handle);
      handle.dispose();
    }
    return result;
  }
  return context.undefined;
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

function toUserSourceError(value: unknown, source: string): Error {
  const error = toError(value);
  error.stack = normalizeUserSourceStack({
    name: error.name,
    message: error.message,
    stack: error.stack,
    source,
  });
  return error;
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
