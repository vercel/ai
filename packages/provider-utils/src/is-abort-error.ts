/**
 * Checks if the given error is an abort error (AbortError, ResponseAborted, or TimeoutError).
 * @param error - The error to check
 * @returns True if the error is an abort error
 */
export function isAbortError(error: unknown): error is Error {
  return (
    (error instanceof Error || error instanceof DOMException) &&
    (error.name === 'AbortError' ||
      error.name === 'ResponseAborted' || // Next.js
      error.name === 'TimeoutError')
  );
}

/**
 * Extracts the abort reason from an abort error if available.
 * When AbortController.abort(reason) is called, the reason is passed as the message.
 * @param error - The abort error
 * @returns The abort reason if available, otherwise undefined
 */
export function getAbortReason(error: unknown): string | undefined {
  if (isAbortError(error) && error.message && error.message !== 'The operation was aborted.') {
    return error.message;
  }
  return undefined;
}
