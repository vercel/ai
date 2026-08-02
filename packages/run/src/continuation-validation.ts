import { Buffer } from 'node:buffer';
import { RunProtocolError } from './errors.js';
import type {
  NormalizedRunOptions,
  RunContinuationState,
  RunLedgerEntry,
  SerializableError,
} from './types.js';
import { parseJson } from './utils/parse-json.js';
import { parseJsonPayload } from './utils/serialization.js';
import { hasExactKeys } from './utils/object-validation.js';

export function assertContinuationTokenSize(
  token: unknown,
  maxBytes: number,
): void {
  const bytes =
    typeof token === 'string'
      ? Buffer.byteLength(token)
      : token instanceof Uint8Array
        ? token.byteLength
        : undefined;
  if (bytes !== undefined && bytes > maxBytes) {
    throw new RunProtocolError(
      `Continuation token exceeds the ${maxBytes} byte size limit.`,
      { bytes, maxBytes },
    );
  }
}

export function assertContinuationState(
  value: unknown,
  source: string,
  scopeHash: string,
  options: NormalizedRunOptions,
): asserts value is RunContinuationState {
  try {
    validateContinuationState(value, source, scopeHash, options);
  } catch (error) {
    if (error instanceof RunProtocolError) throw error;
    throw new RunProtocolError('Continuation state is invalid.', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function validateContinuationState(
  value: unknown,
  source: string,
  scopeHash: string,
  options: NormalizedRunOptions,
): asserts value is RunContinuationState {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'determinism',
      'ledger',
      'logicalRunId',
      'runtime',
      'serde',
      'scopeHash',
      'source',
      'version',
    ]) ||
    value.version !== 2 ||
    value.runtime !== 'run-replay-v2' ||
    value.serde !== 'run-js-v1' ||
    value.source !== source ||
    typeof value.logicalRunId !== 'string' ||
    !/^[0-9a-f]{32}$/u.test(value.logicalRunId) ||
    typeof value.scopeHash !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(value.scopeHash) ||
    value.scopeHash !== scopeHash
  ) {
    throw new RunProtocolError(
      'Continuation does not match the supplied source, scope, or runtime version.',
    );
  }
  if (
    !isRecord(value.determinism) ||
    !hasExactKeys(value.determinism, ['dateNowMs', 'randomSeed']) ||
    !Number.isSafeInteger(value.determinism.dateNowMs) ||
    (value.determinism.dateNowMs as number) < 0 ||
    typeof value.determinism.randomSeed !== 'string' ||
    !/^[0-9a-f]{32}$/iu.test(value.determinism.randomSeed)
  ) {
    throw new RunProtocolError('Continuation determinism state is invalid.');
  }
  if (
    !Array.isArray(value.ledger) ||
    value.ledger.length === 0 ||
    value.ledger.length > options.maxBridgeRequests
  ) {
    throw new RunProtocolError('Continuation ledger length is invalid.');
  }

  let totalBytes = Buffer.byteLength(source) + 128;
  const interruptionIds = new Set<string>();
  const settledOrders = new Set<number>();
  for (const [index, entry] of value.ledger.entries()) {
    assertLedgerEntry(entry, index, options);
    totalBytes += Buffer.byteLength(entry.bindingName);
    totalBytes += Buffer.byteLength(entry.inputJson);
    if (entry.status === 'fulfilled') {
      if (settledOrders.has(entry.settledOrder)) {
        throw new RunProtocolError('Continuation settled order is duplicated.');
      }
      settledOrders.add(entry.settledOrder);
      totalBytes += Buffer.byteLength(entry.valueJson);
    } else if (entry.status === 'rejected') {
      if (settledOrders.has(entry.settledOrder)) {
        throw new RunProtocolError('Continuation settled order is duplicated.');
      }
      settledOrders.add(entry.settledOrder);
      totalBytes += Buffer.byteLength(JSON.stringify(entry.error));
    } else {
      if (interruptionIds.has(entry.interruptionId)) {
        throw new RunProtocolError(
          'Continuation ledger contains a duplicate interruption id.',
        );
      }
      interruptionIds.add(entry.interruptionId);
      totalBytes += Buffer.byteLength(entry.interruptionId);
      totalBytes += Buffer.byteLength(entry.payloadJson);
    }
    if (totalBytes > options.maxContinuationBytes) {
      throw new RunProtocolError(
        `Continuation state exceeds the ${options.maxContinuationBytes} byte size limit.`,
        { bytes: totalBytes, maxBytes: options.maxContinuationBytes },
      );
    }
  }
  const exactBytes = Buffer.byteLength(JSON.stringify(value));
  if (exactBytes > options.maxContinuationBytes) {
    throw new RunProtocolError(
      `Continuation state exceeds the ${options.maxContinuationBytes} byte size limit.`,
      { bytes: exactBytes, maxBytes: options.maxContinuationBytes },
    );
  }
  for (let order = 1; order <= settledOrders.size; order++) {
    if (!settledOrders.has(order)) {
      throw new RunProtocolError(
        'Continuation settled order is not unique and contiguous.',
      );
    }
  }
}

function assertLedgerEntry(
  value: unknown,
  index: number,
  options: NormalizedRunOptions,
): asserts value is RunLedgerEntry {
  if (
    !isRecord(value) ||
    typeof value.bindingName !== 'string' ||
    !/^[A-Za-z_$][\w$]*\.[^.]+$/u.test(value.bindingName) ||
    Buffer.byteLength(value.bindingName) > 1024 ||
    typeof value.inputJson !== 'string' ||
    !['fulfilled', 'rejected', 'interrupted'].includes(String(value.status))
  ) {
    throw new RunProtocolError('Continuation ledger entry is malformed.', {
      index,
    });
  }
  assertSerializedPayload(value.inputJson, options.maxBindingInputBytes, index);
  if (
    !Array.isArray(
      parseJsonPayload(value.inputJson, 'Continuation ledger arguments'),
    )
  ) {
    throw new RunProtocolError(
      'Continuation ledger arguments must be encoded as an array.',
      { index },
    );
  }
  if (value.status === 'fulfilled') {
    if (
      !hasExactKeys(value, [
        'bindingName',
        'dateNowMs',
        'inputJson',
        'settledOrder',
        'status',
        'valueJson',
      ])
    ) {
      throw new RunProtocolError('Fulfilled continuation entry is malformed.', {
        index,
      });
    }
    if (
      typeof value.settledOrder !== 'number' ||
      !Number.isSafeInteger(value.settledOrder) ||
      value.settledOrder <= 0 ||
      !Number.isSafeInteger(value.dateNowMs) ||
      (value.dateNowMs as number) < 0 ||
      typeof value.valueJson !== 'string'
    ) {
      throw new RunProtocolError('Fulfilled continuation entry is malformed.', {
        index,
      });
    }
    assertSerializedPayload(
      value.valueJson,
      options.maxBindingOutputBytes,
      index,
    );
    return;
  }
  if (value.status === 'rejected') {
    if (
      !hasExactKeys(value, [
        'bindingName',
        'dateNowMs',
        'error',
        'inputJson',
        'settledOrder',
        'status',
      ])
    ) {
      throw new RunProtocolError('Rejected continuation entry is malformed.', {
        index,
      });
    }
    if (
      typeof value.settledOrder !== 'number' ||
      !Number.isSafeInteger(value.settledOrder) ||
      value.settledOrder <= 0 ||
      !Number.isSafeInteger(value.dateNowMs) ||
      (value.dateNowMs as number) < 0 ||
      !isSerializableError(value.error)
    ) {
      throw new RunProtocolError('Rejected continuation entry is malformed.', {
        index,
      });
    }
    assertJsonValue(value.error);
    const errorBytes = Buffer.byteLength(JSON.stringify(value.error));
    if (errorBytes > options.maxBindingOutputBytes) {
      throw new RunProtocolError('Continuation error payload is too large.', {
        index,
        bytes: errorBytes,
        maxBytes: options.maxBindingOutputBytes,
      });
    }
    return;
  }
  if (
    !hasExactKeys(value, [
      'bindingName',
      'inputJson',
      'interruptionId',
      'payloadJson',
      'status',
    ]) ||
    value.interruptionId !== `interrupt-${index + 1}` ||
    typeof value.payloadJson !== 'string'
  ) {
    throw new RunProtocolError('Interrupted continuation entry is malformed.', {
      index,
    });
  }
  assertSerializedPayload(
    value.payloadJson,
    options.maxBindingOutputBytes,
    index,
  );
}

function assertSerializedPayload(
  value: string,
  maxBytes: number,
  index: number,
): void {
  const bytes = Buffer.byteLength(value);
  if (bytes > maxBytes) {
    throw new RunProtocolError('Continuation ledger payload is too large.', {
      index,
      bytes,
      maxBytes,
    });
  }
  try {
    parseJson(value);
    parseJsonPayload(value, 'Continuation ledger payload');
  } catch {
    throw new RunProtocolError(
      'Continuation ledger payload is invalid run-js-v1 data.',
      { index },
    );
  }
}

function assertJsonValue(value: unknown, seen = new WeakSet<object>()): void {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return;
  }
  if (typeof value !== 'object') {
    throw new RunProtocolError('Continuation contains a non-JSON value.');
  }
  if (seen.has(value)) {
    throw new RunProtocolError('Continuation contains a cyclic value.');
  }
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) assertJsonValue(item, seen);
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new RunProtocolError('Continuation contains a non-plain object.');
    }
    for (const item of Object.values(value)) assertJsonValue(item, seen);
  }
  seen.delete(value);
}

function isSerializableError(value: unknown): value is SerializableError {
  return (
    isRecord(value) &&
    Object.keys(value).every(key =>
      ['code', 'details', 'message', 'name', 'stack'].includes(key),
    ) &&
    typeof value.name === 'string' &&
    typeof value.message === 'string' &&
    (value.stack === undefined || typeof value.stack === 'string') &&
    (value.code === undefined || typeof value.code === 'string')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
