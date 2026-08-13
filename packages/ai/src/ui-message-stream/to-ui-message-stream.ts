import { asSchema, type ToolSet } from '@ai-sdk/provider-utils';
import type {
  TextStreamPart,
  UIMessageStreamOptions,
} from '../generate-text/stream-text-result';
import type { UIMessage } from '../ui/ui-messages';
import { getResponseUIMessageId } from './get-response-ui-message-id';
import { handleUIMessageStreamFinish } from './handle-ui-message-stream-finish';
import type { InferUIMessageChunk, UIMessageChunk } from './ui-message-chunks';
import { toUIMessageChunk } from './to-ui-message-chunk';

/**
 * Converts a stream of `TextStreamPart<TOOLS>` chunks (as emitted by
 * `streamText`'s `stream`) into a stream of `UIMessageChunk`s suitable for
 * UI message streaming, including response message ID injection and
 * `onEnd` handling.
 */
export function toUIMessageStream<
  TOOLS extends ToolSet = ToolSet,
  UI_MESSAGE extends UIMessage = UIMessage,
>({
  stream,
  tools,
  sendReasoning = true,
  sendSources = false,
  sendStart = true,
  sendFinish = true,
  onError = () => 'An error occurred.', // prevent leaking server error details to the client by default
  messageMetadata,
  originalMessages,
  generateMessageId,
  onEnd,
  onFinish,
}: {
  stream: ReadableStream<TextStreamPart<TOOLS>>;
  tools?: TOOLS;
} & UIMessageStreamOptions<UI_MESSAGE>): ReadableStream<
  InferUIMessageChunk<UI_MESSAGE>
> {
  const toolInputFormatPromises = new Map<string, Promise<'json' | 'text'>>();

  function getToolInputFormat(
    toolName: string,
  ): Promise<'json' | 'text'> | undefined {
    const tool = tools?.[toolName];
    if (tool == null) {
      return undefined;
    }

    let formatPromise = toolInputFormatPromises.get(toolName);
    if (formatPromise == null) {
      formatPromise = Promise.resolve(
        asSchema(tool.inputSchema).jsonSchema,
      ).then(schema => (schema.type === 'string' ? 'text' : 'json'));
      toolInputFormatPromises.set(toolName, formatPromise);
    }

    return formatPromise;
  }

  const responseMessageId =
    generateMessageId != null
      ? getResponseUIMessageId({
          originalMessages,
          responseMessageId: generateMessageId,
        })
      : undefined;

  const uiMessageChunkStream = stream.pipeThrough(
    new TransformStream({
      transform: async (part, controller) => {
        const messageMetadataValue = messageMetadata?.({ part });

        const uiMessageChunk = toUIMessageChunk(part, {
          tools,
          sendReasoning,
          sendSources,
          sendStart,
          sendFinish,
          onError,
          messageMetadata: messageMetadataValue,
          responseMessageId,
        });

        if (uiMessageChunk?.type === 'tool-input-start') {
          const toolInputStartChunk = uiMessageChunk as Extract<
            UIMessageChunk,
            { type: 'tool-input-start' }
          >;
          const inputFormat = await getToolInputFormat(
            toolInputStartChunk.toolName,
          );
          controller.enqueue({
            ...toolInputStartChunk,
            ...(inputFormat != null ? { inputFormat } : {}),
          });
        } else if (uiMessageChunk != null) {
          controller.enqueue(uiMessageChunk);
        }

        // start and finish events already include metadata in the converted
        // chunk; for other part types emit a separate message-metadata chunk
        if (
          messageMetadataValue != null &&
          part.type !== 'start' &&
          part.type !== 'finish'
        ) {
          controller.enqueue({
            type: 'message-metadata',
            messageMetadata: messageMetadataValue,
          });
        }
      },
    }),
  );

  return handleUIMessageStreamFinish({
    stream: uiMessageChunkStream,
    messageId: responseMessageId ?? generateMessageId?.(),
    originalMessages,
    onEnd: onEnd ?? onFinish,
    onError,
  });
}
