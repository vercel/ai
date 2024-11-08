import { convertAsyncIteratorToReadableStream } from '@ai-sdk/provider-utils';
import { mergeStreams } from '../core/util/merge-streams';
import { prepareResponseHeaders } from '../core/util/prepare-response-headers';
import {
  createCallbacksTransformer,
  StreamCallbacks,
} from './stream-callbacks';
import { createStreamDataTransformer, StreamData } from './stream-data';

type EngineResponse = {
  delta: string;
};

export function toDataStream(
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
    .pipeThrough(createStreamDataTransformer());
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
  const dataStream = toDataStream(stream, callbacks);
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
