import {
  CoreMessage,
  createDataStream,
  DataStreamWriter,
  LanguageModelV1,
  streamText,
} from 'ai';
import { DelayedPromise } from '../util/delayed-promise';
import { DataStreamString } from '@ai-sdk/ui-utils';

export type Task<CONTEXT, CHUNK> = ReturnType<typeof task<CONTEXT, CHUNK>>;

export function task<CONTEXT, CHUNK>(options: {
  execute: (options: {
    messages: CoreMessage[];
    context: CONTEXT;
    // TODO writeChunk: (chunk: CHUNK) => void;
    mergeStream: (stream: ReadableStream<CHUNK>) => void;
  }) => PromiseLike<{
    context?: PromiseLike<CONTEXT> | CONTEXT;
    messages?: PromiseLike<CoreMessage[]> | CoreMessage[];
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
    messages,
    context,
    writer,
  }: {
    messages: CoreMessage[];
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
      messages: CoreMessage[];
      context: CONTEXT;
      mergeStream: (stream: ReadableStream<DataStreamString>) => void;
    }) {
      const delayedPromise = new DelayedPromise();
      options.mergeStream(
        createDataStream({
          execute(writer) {
            const result = originalExecute({
              messages: options.messages,
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

export function agenticTask<CONTEXT = undefined>({
  model,
  instruction,
  finalize,
}: {
  model: LanguageModelV1;
  instruction?: string;
  finalize: (options: { messages: CoreMessage[]; context: CONTEXT }) => {
    nextTask: string;
    context?: CONTEXT;
  };
}) {
  return {
    type: 'agentic',
    execute(options: {
      messages: CoreMessage[];
      context: CONTEXT;
      mergeStream: (stream: ReadableStream<DataStreamString>) => void;
    }) {
      const delayedPromise = new DelayedPromise();

      const result = streamText({
        model,
        system: instruction,
        messages: options.messages,

        // TODO bug: resolve if there are error and onFinish is not called
        onFinish({ response }) {
          const allMessages = [...options.messages, ...response.messages];

          const { nextTask, context } = finalize({
            messages: allMessages,
            context: options.context,
          });

          delayedPromise.resolve({
            nextTask,
            context,
          });
        },
      });

      options.mergeStream(result.toAgentStream() as any);

      return delayedPromise.value;
    },
  } as const;
}
