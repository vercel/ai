export function isAbortError(error: unknown): error is DOMException {
  return (
    typeof DOMException !== 'undefined' &&
    error instanceof DOMException &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  );
}
