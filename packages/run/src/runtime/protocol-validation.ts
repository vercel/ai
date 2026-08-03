import { Buffer } from 'node:buffer';
import { RunProtocolError } from '../errors.js';
import type { SerializableError } from '../types.js';
import type { MainToWorkerMessage, WorkerToMainMessage } from './protocol.js';

export function assertMainToWorkerMessage(
  value: unknown,
): asserts value is MainToWorkerMessage {
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw invalidMessage('main-to-worker');
  }
  if (value.type === 'run') {
    assertExactKeys(value, [
      'bindingNamespaces',
      'determinism',
      'invocationId',
      'options',
      'source',
      'type',
    ]);
    if (
      !isIdentifier(value.invocationId) ||
      typeof value.source !== 'string' ||
      !Array.isArray(value.bindingNamespaces) ||
      value.bindingNamespaces.some(item => !isIdentifier(item)) ||
      new Set(value.bindingNamespaces).size !==
        value.bindingNamespaces.length ||
      !isDeterminism(value.determinism) ||
      !isRunOptions(value.options)
    ) {
      throw invalidMessage('run');
    }
    return;
  }
  if (value.type === 'bridge-response') {
    assertBridgeResponse(value);
    return;
  }
  if (value.type === 'cancel') {
    assertExactKeys(value, ['invocationId', 'type']);
    if (!isIdentifier(value.invocationId)) {
      throw invalidMessage('cancel');
    }
    return;
  }
  throw invalidMessage('main-to-worker');
}

export function assertWorkerToMainMessage(
  value: unknown,
): asserts value is WorkerToMainMessage {
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw invalidMessage('worker-to-main');
  }
  if (value.type === 'binding-request') {
    assertBindingRequest(value);
    return;
  }
  if (value.type === 'bridge-idle') {
    assertBridgeIdle(value);
    return;
  }
  if (value.type === 'result') {
    assertResult(value);
    return;
  }
  if (value.type === 'ready') {
    assertReady(value);
    return;
  }
  throw invalidMessage('worker-to-main');
}

function assertBridgeResponse(value: Record<string, unknown>): void {
  const common =
    isIdentifier(value.invocationId) &&
    isIdentifier(value.requestId) &&
    typeof value.success === 'boolean' &&
    isTimestamp(value.dateNowMs);
  if (value.success === true) {
    assertExactKeys(value, [
      'dateNowMs',
      'invocationId',
      'requestId',
      'success',
      'type',
      'valueJson',
    ]);
    if (
      !common ||
      typeof value.valueJson !== 'string' ||
      value.valueJson.length === 0
    ) {
      throw invalidMessage('bridge-response');
    }
    return;
  }
  assertExactKeys(value, [
    'dateNowMs',
    'error',
    'invocationId',
    'requestId',
    'success',
    'type',
  ]);
  if (!common || !isSerializableError(value.error)) {
    throw invalidMessage('bridge-response');
  }
}

function assertBindingRequest(value: Record<string, unknown>): void {
  assertExactKeys(value, [
    'bindingName',
    'inputJson',
    'invocationId',
    'requestId',
    'type',
  ]);
  if (
    !isIdentifier(value.invocationId) ||
    !isIdentifier(value.requestId) ||
    typeof value.bindingName !== 'string' ||
    value.bindingName.length === 0 ||
    Buffer.byteLength(value.bindingName) > 1024 ||
    typeof value.inputJson !== 'string' ||
    value.inputJson.length === 0
  ) {
    throw invalidMessage('binding-request');
  }
}

function assertBridgeIdle(value: Record<string, unknown>): void {
  assertExactKeys(value, ['invocationId', 'requestCount', 'type']);
  if (
    !isIdentifier(value.invocationId) ||
    !Number.isSafeInteger(value.requestCount) ||
    (value.requestCount as number) < 0
  ) {
    throw invalidMessage('bridge-idle');
  }
}

function assertResult(value: Record<string, unknown>): void {
  if (value.success === true) {
    assertExactKeys(value, ['invocationId', 'success', 'type', 'valueJson']);
    if (
      !isIdentifier(value.invocationId) ||
      typeof value.valueJson !== 'string' ||
      value.valueJson.length === 0
    ) {
      throw invalidMessage('result');
    }
    return;
  }
  assertExactKeys(value, ['error', 'invocationId', 'success', 'type']);
  if (
    value.success !== false ||
    !isIdentifier(value.invocationId) ||
    !isSerializableError(value.error)
  ) {
    throw invalidMessage('result');
  }
}

function assertReady(value: Record<string, unknown>): void {
  assertExactKeys(value, ['invocationId', 'type']);
  if (!isIdentifier(value.invocationId)) {
    throw invalidMessage('ready');
  }
}

function isDeterminism(value: unknown): boolean {
  if (!isRecord(value)) return false;
  try {
    assertExactKeys(value, ['dateNowMs', 'randomSeed']);
  } catch {
    return false;
  }
  return (
    isTimestamp(value.dateNowMs) &&
    typeof value.randomSeed === 'string' &&
    /^[0-9a-f]{32}$/u.test(value.randomSeed)
  );
}

function isRunOptions(value: unknown): boolean {
  if (!isRecord(value)) return false;
  try {
    assertExactKeys(value, [
      'executionTimeoutMs',
      'maxBindingInputBytes',
      'maxConsoleOutputBytes',
      'maxResultBytes',
      'maxStackSizeBytes',
      'memoryLimitBytes',
      'timeoutMs',
    ]);
  } catch {
    return false;
  }
  return Object.values(value).every(
    item => Number.isSafeInteger(item) && (item as number) > 0,
  );
}

function isSerializableError(value: unknown): value is SerializableError {
  if (!isRecord(value)) return false;
  const allowed = ['code', 'details', 'message', 'name', 'stack'];
  if (Object.keys(value).some(key => !allowed.includes(key))) return false;
  return (
    typeof value.name === 'string' &&
    typeof value.message === 'string' &&
    (value.stack === undefined || typeof value.stack === 'string') &&
    (value.code === undefined || typeof value.code === 'string')
  );
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: string[],
): void {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw invalidMessage('object shape');
  }
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 512;
}

function isTimestamp(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidMessage(kind: string): RunProtocolError {
  return new RunProtocolError(`Invalid ${kind} worker protocol message.`);
}
