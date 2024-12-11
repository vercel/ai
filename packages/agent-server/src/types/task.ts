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
    context?: PromiseLike<CONTEXT> | CONTEXT;
    nextTask: PromiseLike<string> | string;
  }>;
}) {
  return {
    type: 'stream',
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
              writeData: writer.writeData.bind(writer),
              mergeStream: writer.merge.bind(writer),
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
