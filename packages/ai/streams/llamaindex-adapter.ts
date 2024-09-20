import { mergeStreams } from '../core/util/merge-streams';
import { prepareResponseHeaders } from '../core/util/prepare-response-headers';
import { createStreamDataTransformer, StreamData } from './stream-data';
import {
  AIStreamCallbacksAndOptions,
  createCallbacksTransformer,
  trimStartOfStreamHelper,
} from './ai-stream';

type EngineResponse = {
  delta: string;
};

export function toDataStream(
  stream: AsyncIterable<EngineResponse>,
  callbacks?: AIStreamCallbacksAndOptions,
) {
  return toReadableStream(stream)
    .pipeThrough(createCallbacksTransformer(callbacks))
    .pipeThrough(createStreamDataTransformer());
}

export function toDataStreamResponse(
  stream: AsyncIterable<EngineResponse>,
  options: {
    init?: ResponseInit;
    data?: StreamData;
    callbacks?: AIStreamCallbacksAndOptions;
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
    headers: prepareResponseHeaders(init, {
      contentType: 'text/plain; charset=utf-8',
      dataStreamVersion: 'v1',
    }),
  });
}

function toReadableStream(res: AsyncIterable<EngineResponse>) {
  const it = res[Symbol.asyncIterator]();
  const trimStartOfStream = trimStartOfStreamHelper();

  return new ReadableStream<string>({
    async pull(controller): Promise<void> {
      const { value, done } = await it.next();
      if (done) {
        controller.close();
        return;
      }
      const text = trimStartOfStream(value.delta ?? '');
      if (text) {
        controller.enqueue(text);
      }
    },
  });
}
