import { formatDataStreamPart } from '@ai-sdk/ui-utils';
import { DataStreamWriter } from '../core/data-stream/data-stream-writer';
import { mergeStreams } from '../core/util/merge-streams';
import { prepareResponseHeaders } from '../core/util/prepare-response-headers';
import {
  createCallbacksTransformer,
  StreamCallbacks,
} from './stream-callbacks';
import { StreamData } from './stream-data';

type LangChainImageDetail = 'auto' | 'low' | 'high';

type LangChainMessageContentText = {
  type: 'text';
  text: string;
};

type LangChainMessageContentImageUrl = {
  type: 'image_url';
  image_url:
    | string
    | {
        url: string;
        detail?: LangChainImageDetail;
      };
};

type LangChainMessageContentComplex =
  | LangChainMessageContentText
  | LangChainMessageContentImageUrl
  | (Record<string, any> & {
      type?: 'text' | 'image_url' | string;
    })
  | (Record<string, any> & {
      type?: never;
    });

type LangChainMessageContent = string | LangChainMessageContentComplex[];

type LangChainAIMessageChunk = {
  content: LangChainMessageContent;
};

// LC stream event v2
type LangChainStreamEvent = {
  event: string;
  data: any;
};

function toDataStreamInternal(
  stream:
    | ReadableStream<LangChainStreamEvent>
    | ReadableStream<LangChainAIMessageChunk>
    | ReadableStream<string>,
  callbacks?: StreamCallbacks,
) {
  return stream
    .pipeThrough(
      new TransformStream<
        LangChainStreamEvent | LangChainAIMessageChunk | string
      >({
        transform: async (value, controller) => {
          // text stream:
          if (typeof value === 'string') {
            controller.enqueue(value);
            return;
          }

          // LC stream events v2:
          if ('event' in value) {
            // chunk is AIMessage Chunk for on_chat_model_stream event:
            if (value.event === 'on_chat_model_stream') {
              forwardAIMessageChunk(
                value.data?.chunk as LangChainAIMessageChunk,
                controller,
              );
            }
            return;
          }

          // AI Message chunk stream:
          forwardAIMessageChunk(value, controller);
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

/**
Converts LangChain output streams to an AI SDK Data Stream.

The following streams are supported:
- `LangChainAIMessageChunk` streams (LangChain `model.stream` output)
- `string` streams (LangChain `StringOutputParser` output)
 */
export function toDataStream(
  stream:
    | ReadableStream<LangChainStreamEvent>
    | ReadableStream<LangChainAIMessageChunk>
    | ReadableStream<string>,
  callbacks?: StreamCallbacks,
) {
  return toDataStreamInternal(stream, callbacks).pipeThrough(
    new TextEncoderStream(),
  );
}

export function toDataStreamResponse(
  stream:
    | ReadableStream<LangChainStreamEvent>
    | ReadableStream<LangChainAIMessageChunk>
    | ReadableStream<string>,
  options?: {
    init?: ResponseInit;
    data?: StreamData;
    callbacks?: StreamCallbacks;
  },
) {
  const dataStream = toDataStreamInternal(
    stream,
    options?.callbacks,
  ).pipeThrough(new TextEncoderStream());
  const data = options?.data;
  const init = options?.init;

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
  stream:
    | ReadableStream<LangChainStreamEvent>
    | ReadableStream<LangChainAIMessageChunk>
    | ReadableStream<string>,
  options: { dataStream: DataStreamWriter; callbacks?: StreamCallbacks },
) {
  options.dataStream.merge(toDataStreamInternal(stream, options.callbacks));
}

function forwardAIMessageChunk(
  chunk: LangChainAIMessageChunk,
  controller: TransformStreamDefaultController<any>,
) {
  if (typeof chunk.content === 'string') {
    controller.enqueue(chunk.content);
  } else {
    const content: LangChainMessageContentComplex[] = chunk.content;
    for (const item of content) {
      if (item.type === 'text') {
        controller.enqueue(item.text);
      }
    }
  }
}
