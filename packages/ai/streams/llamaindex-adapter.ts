import { convertAsyncIteratorToReadableStream } from '@ai-sdk/provider-utils';
import { formatDataStreamPart } from '@ai-sdk/ui-utils';
import { DataStreamWriter } from '../core/data-stream/data-stream-writer';
import { mergeStreams } from '../core/util/merge-streams';
import { prepareResponseHeaders } from '../core/util/prepare-response-headers';
import {
  createCallbacksTransformer,
  StreamCallbacks,
} from './stream-callbacks';
import { StreamData } from './stream-data';

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
    data?: StreamData;
    callbacks?: StreamCallbacks;
  } = {},
) {
  const { init, data, callbacks } = options;
  const dataStream = toDataStreamInternal(stream, callbacks).pipeThrough(
    new TextEncoderStream(),
  );
  const responseStream = data
    ? mergeStreams(data.stream, dataStream)
    : dataStream;

  return new Response(responseStream, {
    status: init?.status ?? 200,
    statusText: init?.statusText,
    headers: prepareResponseHeaders(init?.headers, {
      contentType: 'text/plain; charset=utf-8',
      dataStreamVersion: 'v1',
    }),
  });
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
