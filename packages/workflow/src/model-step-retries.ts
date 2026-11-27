import { getErrorMessage } from '@ai-sdk/provider-utils';

/**
 * How often the workflow runtime may run a model step again. The step reports
 * every failure as fatal, so the runtime never repeats it after an error: SDK
 * `maxRetries` alone governs retries of a failed model call. The runtime only
 * runs the step again when its previous execution did not report an outcome,
 * for example because the function instance was terminated mid-call.
 *
 * A step that the runtime may run again is also one whose body the runtime
 * may start before the step's start is recorded, which removes a write round
 * trip before every model call. With `0`, the runtime treats the step as
 * at-most-once and records its start first.
 */
export const MODEL_STEP_MAX_RETRIES = 1;

/**
 * Marks a failure of a model step as fatal for the workflow runtime, so the
 * runtime does not run the step again. The original error is kept, so its
 * name and message reach the workflow code.
 */
export function asFatalModelStepError(error: unknown): unknown {
  if (typeof error === 'object' && error !== null) {
    try {
      // The runtime treats any error with `fatal: true` as fatal.
      Object.defineProperty(error, 'fatal', {
        value: true,
        enumerable: false,
        configurable: true,
      });
      if ('name' in error && 'message' in error) return error;
    } catch {
      // Frozen or sealed: fall through to a fatal wrapper.
    }
  }

  // The runtime only recognizes error objects. Wrap anything else.
  return Object.assign(new Error(getErrorMessage(error), { cause: error }), {
    fatal: true,
  });
}
