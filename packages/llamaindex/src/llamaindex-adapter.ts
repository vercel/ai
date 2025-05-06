import { convertAsyncIteratorToReadableStream } from '@ai-sdk/provider-utils';
import { formatDataStreamPart, DataStreamWriter } from 'ai';
import {
  prepareResponseHeaders,
  createCallbacksTransformer,
  StreamCallbacks,
} from 'ai/internal';

type EngineResponse = {
  delta: string;
};

function toDataStreamInternal(
  stream: AsyncIterable<EngineResponse>,
  callbacks?: StreamCallbacks,
) {
  const trimStart = trimStartOfStream();

  return convertAsyncIteratorToReadableStream(stream[Symbol.asyncIterator]())
    .pipeThrough(
      new TransformStream({
        async transform(message, controller): Promise<void> {
          controller.enqueue(trimStart(message.delta));
        },
      }),
    )
    .pipeThrough(createCallbacksTransformer(callbacks))
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(
      new TransformStream({
        transform: async (chunk, controller) => {
          controller.enqueue(formatDataStreamPart('text', chunk));
        },
      }),
    );
}

export function toDataStream(
  stream: AsyncIterable<EngineResponse>,
  callbacks?: StreamCallbacks,
) {
  return toDataStreamInternal(stream, callbacks).pipeThrough(
    new TextEncoderStream(),
  );
}

export function toDataStreamResponse(
  stream: AsyncIterable<EngineResponse>,
  options: {
    init?: ResponseInit;
    callbacks?: StreamCallbacks;
  } = {},
) {
  const { init, callbacks } = options;

  return new Response(
    toDataStreamInternal(stream, callbacks).pipeThrough(
      new TextEncoderStream(),
    ),
    {
      status: init?.status ?? 200,
      statusText: init?.statusText,
      headers: prepareResponseHeaders(init?.headers, {
        contentType: 'text/plain; charset=utf-8',
        dataStreamVersion: 'v1',
      }),
    },
  );
}

export function mergeIntoDataStream(
  stream: AsyncIterable<EngineResponse>,
  options: {
    dataStream: DataStreamWriter;
    callbacks?: StreamCallbacks;
  },
) {
  options.dataStream.merge(toDataStreamInternal(stream, options.callbacks));
}

function trimStartOfStream(): (text: string) => string {
  let isStreamStart = true;

  return (text: string): string => {
    if (isStreamStart) {
      text = text.trimStart();
      if (text) isStreamStart = false;
    }
    return text;
  };
}
