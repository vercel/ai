import {
  CoreMessage,
  createDataStream,
  DataStreamWriter,
  LanguageModelV1,
  streamText,
} from 'ai';
import { DelayedPromise } from '../util/delayed-promise';
import { DataStreamString } from '@ai-sdk/ui-utils';
import { JSONValue } from '@ai-sdk/provider';

export type Task<CONTEXT> = ReturnType<typeof task<CONTEXT>>;

export function task<CONTEXT>({
  execute: originalExecute,
}: {
  execute: ({
    messages,
    context,
    writer,
    writeData,
  }: {
    messages: CoreMessage[];
    context: CONTEXT;
    writer: DataStreamWriter;
    writeData(value: JSONValue): void;
    mergeStream(stream: ReadableStream<DataStreamString>): void;
  }) => PromiseLike<{
    context?: CONTEXT;
    messages?: CoreMessage[];
    nextTask: string;
  }>;
}) {
  return {
    type: 'stream',
    execute(options: {
      messages: CoreMessage[];
      context: CONTEXT;
      mergeStream: (stream: ReadableStream<DataStreamString>) => void;
    }) {
      const delayedPromise = new DelayedPromise<{
        context?: CONTEXT;
        messages: CoreMessage[];
        nextTask: string;
      }>();
      options.mergeStream(
        createDataStream({
          async execute(writer) {
            const result = await originalExecute({
              messages: options.messages,
              context: options.context,
              writer,
              writeData: writer.writeData.bind(writer),
              mergeStream: writer.merge.bind(writer),
            });

            delayedPromise.resolve({
              context: result.context ?? options.context,
              messages: result.messages ?? options.messages,
              nextTask: result.nextTask,
            });
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
  prepare,
  finalize,
}: {
  model: LanguageModelV1;
  instruction?: string;
  prepare?: (options: {
    messages: CoreMessage[];
    context: CONTEXT;
  }) => PromiseLike<{
    messages?: CoreMessage[];
    context?: CONTEXT;
  }>;
  finalize: (options: {
    messages: CoreMessage[];
    context: CONTEXT;
  }) => PromiseLike<{
    nextTask: string;
    context?: CONTEXT;
  }>;
}) {
  return {
    type: 'agentic',
    async execute(options: {
      messages: CoreMessage[];
      context: CONTEXT;
      mergeStream: (stream: ReadableStream<DataStreamString>) => void;
    }) {
      const {
        messages = options.messages,
        context: preparedContext = options.context,
      } = (await prepare?.({
        messages: options.messages,
        context: options.context,
      })) ?? { messages: options.messages, context: options.context };

      const delayedPromise = new DelayedPromise();

      const result = streamText({
        model,
        system: instruction,
        messages,

        // TODO bug: resolve if there are error and onFinish is not called
        async onFinish({ response }) {
          const allMessages = [...messages, ...response.messages];

          const { nextTask, context } = await finalize({
            messages: allMessages,
            context: preparedContext,
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
