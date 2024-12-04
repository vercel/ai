import { createDataStream, DataStreamWriter } from 'ai';
import { DelayedPromise } from '../util/delayed-promise';
import { DataStreamString } from '@ai-sdk/ui-utils';

export type StreamTask<CONTEXT, CHUNK> = ReturnType<
  typeof streamTask<CONTEXT, CHUNK>
>;

export function streamTask<CONTEXT, CHUNK>(options: {
  execute: (options: {
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

export function dataStreamTask<CONTEXT>({
  execute: originalExecute,
}: {
  execute: ({
    context,
    writer,
  }: {
    context: CONTEXT;
    writer: DataStreamWriter;
  }) => PromiseLike<{
    context?: PromiseLike<CONTEXT> | CONTEXT;
    nextTask: PromiseLike<string> | string;
  }>;
}) {
  return {
    type: 'data-stream',
    execute(options: {
      context: CONTEXT;
      mergeStream: (stream: ReadableStream<DataStreamString>) => void;
    }) {
      const delayedPromise = new DelayedPromise();
      options.mergeStream(
        createDataStream({
          execute(writer) {
            const result = originalExecute({
              context: options.context,
              writer,
            });
            delayedPromise.resolve(result);
          },
        }) as ReadableStream<DataStreamString>,
      );
      return delayedPromise.value;
    },
  } as const;
}
