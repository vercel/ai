import {
  AIStreamCallbacksAndOptions,
  createCallbacksTransformer,
} from './ai-stream';
import { createStreamDataTransformer } from './stream-data';

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

/**
Converts LangChain output streams to AIStream. 

The following streams are supported:
- `LangChainAIMessageChunk` streams (LangChain `model.stream` output)
- `string` streams (LangChain `StringOutputParser` output)
 */
export function toAIStream(
  stream: ReadableStream<LangChainAIMessageChunk> | ReadableStream<string>,
  callbacks?: AIStreamCallbacksAndOptions,
) {
  return stream
    .pipeThrough(
      new TransformStream<LangChainAIMessageChunk | string>({
        transform: async (chunk, controller) => {
          if (typeof chunk === 'string') {
            controller.enqueue(chunk);
          } else if (typeof chunk.content === 'string') {
            controller.enqueue(chunk.content);
          } else {
            const content: LangChainMessageContentComplex[] = chunk.content;
            for (const item of content) {
              if (item.type === 'text') {
                controller.enqueue(item.text);
              }
            }
          }
        },
      }),
    )
    .pipeThrough(createCallbacksTransformer(callbacks))
    .pipeThrough(createStreamDataTransformer());
}
