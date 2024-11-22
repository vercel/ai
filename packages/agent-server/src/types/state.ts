export interface StreamState<CONTEXT, CHUNK> {
  type: 'stream';
  execute(options: { context: CONTEXT }): PromiseLike<{
    context?: PromiseLike<CONTEXT> | CONTEXT;
    stream: ReadableStream<CHUNK>;
    nextState: PromiseLike<string> | string;
  }>;
}
