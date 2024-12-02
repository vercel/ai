export interface StreamState<CONTEXT, CHUNK> {
  type: 'stream';
  execute(options: {
    context: CONTEXT;
    forwardStream: (stream: ReadableStream<CHUNK>) => void;
  }): PromiseLike<{
    context?: PromiseLike<CONTEXT> | CONTEXT;
    nextTask: PromiseLike<string> | string;
  }>;
}
