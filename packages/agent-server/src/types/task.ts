export class StreamTask<CONTEXT, CHUNK> {
  readonly type = 'stream';

  readonly execute: (options: {
    context: CONTEXT;
    mergeStream: (stream: ReadableStream<CHUNK>) => void;
  }) => PromiseLike<{
    context?: PromiseLike<CONTEXT> | CONTEXT;
    nextTask: PromiseLike<string> | string;
  }>;

  constructor(options: { execute: StreamTask<CONTEXT, CHUNK>['execute'] }) {
    this.execute = options.execute;
  }
}
