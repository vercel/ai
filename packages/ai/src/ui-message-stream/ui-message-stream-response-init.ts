export type UIMessageStreamResponseInit = ResponseInit & {
  /**
   * Optional interval in milliseconds for sending SSE keep-alive comments.
   * When set, an opening comment is sent immediately and additional comments
   * are sent after the stream has been idle for the configured interval.
   */
  keepAliveMs?: number;

  consumeSseStream?: (options: {
    stream: ReadableStream<string>;
  }) => PromiseLike<void> | void;
};
