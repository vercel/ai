import { normalizeJsonPayload } from './utils/serialization.js';

const interruptMarker = Symbol('run.binding-interrupt');

export interface BindingInterruptSignal extends Error {
  readonly payload: unknown;
  readonly [interruptMarker]: true;
}

export function interrupt(payload: unknown): never {
  const normalizedPayload = normalizeJsonPayload(
    payload,
    Number.MAX_SAFE_INTEGER,
    'Interruption payload',
  );
  const error = new Error('Host binding interruption requested.');
  error.name = 'BindingInterruptSignal';
  Object.defineProperties(error, {
    [interruptMarker]: { value: true },
    payload: { value: normalizedPayload },
  });
  throw error;
}

export function isBindingInterruptSignal(
  value: unknown,
): value is BindingInterruptSignal {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Partial<BindingInterruptSignal>)[interruptMarker] === true
  );
}
