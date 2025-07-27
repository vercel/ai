import { UIMessageChunk } from 'ai';
import {
  createCallbacksTransformer,
  StreamCallbacks,
} from './stream-callbacks';

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

/**
Converts LangChain output streams to an AI SDK Data Stream.

The following streams are supported:
- `LangChainAIMessageChunk` streams (LangChain `model.stream` output)
- `string` streams (LangChain `StringOutputParser` output)
 */
export function toUIMessageStream(
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
    .pipeThrough(
      new TransformStream<string, UIMessageChunk>({
        start: async controller => {
          controller.enqueue({ type: 'text-start', id: '1' });
        },
        transform: async (chunk, controller) => {
          controller.enqueue({ type: 'text-delta', delta: chunk, id: '1' });
        },
        flush: async controller => {
          controller.enqueue({ type: 'text-end', id: '1' });
        },
      }),
    );
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
