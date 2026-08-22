/**
 * Options for creating a UI message stream response.
 * Extends the standard `ResponseInit` with additional streaming options.
 */
export type UIMessageStreamResponseInit = ResponseInit & {
  /**
   * Optional callback to consume a copy of the SSE stream independently.
   * This is useful for logging, debugging, or processing the stream in parallel.
   * The callback receives a tee'd copy of the stream and does not block the response.
   */
  consumeSseStream?: (options: {
    stream: ReadableStream<string>;
  }) => PromiseLike<void> | void;

  /**
   * Interval in milliseconds at which SSE keep-alive comments are sent while
   * the stream is idle. A keep-alive comment is also sent immediately, so that
   * the response headers are flushed before the first chunk is available.
   *
   * Keep-alive comments are ignored by SSE clients (they are comments in the
   * SSE wire format) and are not sent to `consumeSseStream`.
   *
   * This is useful when the response is served through a reverse proxy or CDN
   * that terminates connections that are idle or have not started sending a
   * response yet. Choose a value comfortably below the proxy timeout,
   * e.g. `25000` for the 100s Cloudflare timeout.
   *
   * Keep-alive comments are disabled by default.
   */
  keepAliveMs?: number;
};
