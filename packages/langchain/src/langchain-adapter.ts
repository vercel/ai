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
  tags: string[];
};

// Extended UIMessageChunk type to include tags
export type UIMessageChunkWithTags = UIMessageChunk & {
  tagMapping?: Record<string, number[]>;
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

/**
 * Converts LangChain stream events to UI Message chunks with tag-based part separation.
 *
 * This function creates separate message parts based on the tags present in each stream chunk.
 * When the set of tags changes between chunks, a new message part is created, allowing the UI
 * to display content from different stages/sources separately.
 *
 * @param stream - ReadableStream of LangChain stream events
 * @param tags - Array of tag names to filter and track. Only chunks with these tags will be processed
 *
 * @returns A ReadableStream of UIMessageChunkWithTags that includes:
 * - `text-start`, `text-delta`, `text-end` chunks for each message part
 * - `message-metadata` chunks containing the complete tag-to-partIds mapping
 *
 * The metadata includes a `tagMapping` field: `Record<string, number[]>` where:
 * - Keys are tag names
 * - Values are arrays of part IDs that contain content for that tag
 *
 * Example:
 * ```typescript
 * const stream = toTaggedUIMessageStream(langchainStream, ['stage:research', 'stage:synthesis']);
 * // Results in metadata like: { tagMapping: { 'stage:research': [1, 3], 'stage:synthesis': [2] } }
 * ```
 */
export function toTaggedUIMessageStream(
  stream: ReadableStream<LangChainStreamEvent>,
  tags: string[],
) {
  let currentTagsSet = new Set<string>();
  let currentMessageId = 0;
  let hasStartedMessage = false;
  // Initialize mapping with all input tags pointing to empty arrays
  let tagToPartMapping: Record<string, number[]> = Object.fromEntries(
    tags.map(tag => [tag, []]),
  );

  return stream.pipeThrough(
    new TransformStream<LangChainStreamEvent, UIMessageChunkWithTags>({
      transform: async (value, controller) => {
        if ('event' in value && value.event === 'on_chat_model_stream') {
          const text = textFromAIMessageChunk(
            value.data?.chunk as LangChainAIMessageChunk,
          );
          const relevantTags =
            value.tags?.filter((t: string) => tags.includes(t)) || [];

          const needsNewPart =
            relevantTags.length !== currentTagsSet.size ||
            !relevantTags.every(tag => currentTagsSet.has(tag)) ||
            !hasStartedMessage;

          if (needsNewPart) {
            // End previous text part if one was started
            if (hasStartedMessage) {
              controller.enqueue({
                type: 'text-end',
                id: currentMessageId.toString(),
              });
              currentMessageId++;
            }

            // Update current tags set
            currentTagsSet = new Set(relevantTags);
            hasStartedMessage = true;

            // Update tag to part mapping for relevant tags
            for (const tag of relevantTags) {
              tagToPartMapping[tag].push(currentMessageId);
            }

            // Send complete tag mapping (overwrites previous metadata)
            controller.enqueue({
              type: 'message-metadata',
              messageMetadata: {
                tagMapping: tagToPartMapping,
              },
            });

            // Start new text part
            controller.enqueue({
              type: 'text-start',
              id: currentMessageId.toString(),
            });
          }

          // Send the text delta chunk if there's content
          if (text) {
            controller.enqueue({
              type: 'text-delta',
              delta: text,
              id: currentMessageId.toString(),
            });
          }
        }
      },
      flush: async controller => {
        // End the last message if one was started
        if (hasStartedMessage) {
          controller.enqueue({
            type: 'text-end',
            id: currentMessageId.toString(),
          });
        }
      },
    }),
  );
}

function forwardAIMessageChunk(
  chunk: LangChainAIMessageChunk,
  controller: TransformStreamDefaultController<any>,
) {
  controller.enqueue(textFromAIMessageChunk(chunk));
}

function textFromAIMessageChunk(chunk: LangChainAIMessageChunk): string {
  if (typeof chunk.content === 'string') {
    return chunk.content;
  } else {
    const content: LangChainMessageContentComplex[] = chunk.content;
    let text = '';
    for (const item of content) {
      if (item.type === 'text') {
        text += item.text;
      }
    }
    return text;
  }
}
