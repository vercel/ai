export type UIMessageStreamResponseInit = ResponseInit & {
  consumeSseStream?: (options: {
    stream: ReadableStream<string>;
  }) => PromiseLike<void> | void;
};
