export function streamTask<CONTEXT, CHUNK>(options: {
  execute: ({
    context,
    mergeStream,
  }: {
    context: CONTEXT;
    mergeStream: (stream: ReadableStream<CHUNK>) => void;
  }) => PromiseLike<{
    context?: PromiseLike<CONTEXT> | CONTEXT;
    nextTask: PromiseLike<string> | string;
  }>;
}) {
  return {
    type: 'stream',
    execute: options.execute,
  } as const;
}
