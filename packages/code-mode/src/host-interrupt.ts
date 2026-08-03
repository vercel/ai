import type { CodeModeInterruptPayload } from './types.js';

const CODE_MODE_HOST_INTERRUPT_SIGNAL = Symbol.for(
  '@ai-sdk/code-mode.host-interrupt',
);

interface CodeModeHostInterruptSignal extends Error {
  readonly [CODE_MODE_HOST_INTERRUPT_SIGNAL]: true;
  readonly payload: CodeModeInterruptPayload;
}

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

  const error = new Error('Code mode host interruption requested.');
  error.name = 'CodeModeHostInterruptSignal';
  Object.defineProperties(error, {
    [CODE_MODE_HOST_INTERRUPT_SIGNAL]: { value: true },
    payload: { value: payload },
  });
  throw error;
}

export function isCodeModeHostInterruptSignal(
  value: unknown,
): value is CodeModeHostInterruptSignal {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { [CODE_MODE_HOST_INTERRUPT_SIGNAL]?: unknown })[
      CODE_MODE_HOST_INTERRUPT_SIGNAL
    ] === true &&
    typeof (value as { payload?: unknown }).payload === 'object' &&
    (value as { payload?: unknown }).payload !== null
  );
}
