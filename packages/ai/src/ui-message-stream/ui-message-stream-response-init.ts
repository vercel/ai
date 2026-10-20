/**
 * Options for creating a UI message stream response.
 * Extends the standard `ResponseInit` with additional streaming options.
 */
export type UIMessageStreamResponseInit = ResponseInit & {
  /**
   * Optional interval in milliseconds for sending SSE keep-alive comments.
   * When set, an opening comment is sent immediately and additional comments
   * are sent after the stream has been idle for the configured interval.
   */
  keepAliveMs?: number;

  /**
   * Optional callback to consume a copy of the SSE stream independently.
   * This is useful for logging, debugging, or processing the stream in parallel.
   * The callback receives a tee'd copy of the stream and does not block the response.
   */
  consumeSseStream?: (options: {
    stream: ReadableStream<string>;
  }) => PromiseLike<void> | void;
};
