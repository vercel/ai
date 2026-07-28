import type { CodeModeInterruptPayload } from './types.js';

const CODE_MODE_HOST_INTERRUPT_SIGNAL = Symbol.for(
  '@ai-sdk/code-mode.host-interrupt',
);

interface CodeModeHostInterruptSignal extends Error {
  readonly [CODE_MODE_HOST_INTERRUPT_SIGNAL]: true;
  readonly payload: CodeModeInterruptPayload;
}

/**
 * Interrupts the current nested host tool call and returns control to the host.
 *
 * Host tools can call this when they need an external pause, such as connection
 * OAuth. Code mode returns a serializable `CodeModeInterrupt` with an opaque
 * continuation instead of treating the pause as a tool failure.
 *
 * @param payload - JSON-serializable interruption payload with a stable `kind`.
 */
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
    [CODE_MODE_HOST_INTERRUPT_SIGNAL]: {
      value: true,
    },
    payload: {
      value: payload,
    },
  });
  throw error;
}

/**
 * Returns true when an unknown thrown value is the internal host-interrupt
 * signal thrown by `requestCodeModeInterrupt`.
 *
 * @internal
 */
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
