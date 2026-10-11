function cancelStream(stream: ReadableStream<string>, error: unknown): void {
  try {
    void stream.cancel(error).catch(() => {});
  } catch {
    // The consumer may have locked the stream before failing.
  }
}

function reportError({
  error,
  onError,
}: {
  error: unknown;
  onError?: (error: unknown) => PromiseLike<void> | void;
}): void {
  try {
    void Promise.resolve(onError?.(error)).catch(() => {});
  } catch {
    // Error reporting must not affect the client response.
  }
}

export function runConsumeSseStream({
  stream,
  consumeSseStream,
  onError,
}: {
  stream: ReadableStream<string>;
  consumeSseStream: (options: {
    stream: ReadableStream<string>;
  }) => PromiseLike<void> | void;
  onError?: (error: unknown) => PromiseLike<void> | void;
}): void {
  const handleError = (error: unknown) => {
    cancelStream(stream, error);
    reportError({ error, onError });
  };

  try {
    void Promise.resolve(consumeSseStream({ stream })).catch(handleError);
  } catch (error) {
    handleError(error);
  }
}
