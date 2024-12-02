export interface StreamTask<CONTEXT, CHUNK> {
  type: 'stream';
  execute(options: {
    context: CONTEXT;
    mergeStream: (stream: ReadableStream<CHUNK>) => void;
  }): PromiseLike<{
    context?: PromiseLike<CONTEXT> | CONTEXT;
    nextTask: PromiseLike<string> | string;
  }>;
}
