import { getHostFunctionContext } from 'run';
import type { CodeModeInterruptPayload } from './types.js';

export function requestCodeModeInterrupt<
  TPayload extends CodeModeInterruptPayload,
>(payload: TPayload): never {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload)
  ) {
    throw new TypeError('Code mode interrupt payload must be an object.');
  }
  if (typeof payload.kind !== 'string' || payload.kind.length === 0) {
    throw new TypeError(
      'Code mode interrupt payload must include a string kind.',
    );
  }
  return getHostFunctionContext().interrupt(payload);
}
