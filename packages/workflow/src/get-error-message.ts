/**
 * Safely extract a human-readable message from an unknown error value.
 *
 * Avoids the `String(error)` pitfall that produces `"[object Object]"`
 * when the thrown value is a plain object rather than an Error instance.
 *
 * Matches the behaviour of AI SDK's `getErrorMessage` from
 * `@ai-sdk/provider-utils`.
 */
export function getErrorMessage(error: unknown): string {
  if (error == null) {
    return 'unknown error';
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return JSON.stringify(error);
}
