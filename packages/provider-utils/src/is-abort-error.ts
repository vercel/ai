export function isAbortError(error: unknown): error is Error {
  return (
    (error instanceof Error ||
      (typeof DOMException === 'function' && error instanceof DOMException)) &&
    (error.name === 'AbortError' ||
      error.name === 'ResponseAborted' || // Next.js
      error.name === 'TimeoutError')
  );
}
