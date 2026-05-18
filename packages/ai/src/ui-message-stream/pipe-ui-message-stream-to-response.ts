import { getErrorMessage, type ToolSet } from '@ai-sdk/provider-utils';
import type { ServerResponse } from 'node:http';
import type {
  TextStreamPart,
  UIMessageStreamOptions,
} from '../generate-text/stream-text-result';
import type { UIMessage } from '../ui/ui-messages';
import { prepareHeaders } from '../util/prepare-headers';
import { writeToServerResponse } from '../util/write-to-server-response';
import { getResponseUIMessageId } from './get-response-ui-message-id';
import { handleUIMessageStreamFinish } from './handle-ui-message-stream-finish';
import { JsonToSseTransformStream } from './json-to-sse-transform-stream';
import { toUIMessageChunk } from './to-ui-message-chunk';
import { UI_MESSAGE_STREAM_HEADERS } from './ui-message-stream-headers';
import type { InferUIMessageChunk, UIMessageChunk } from './ui-message-chunks';
import type { UIMessageStreamResponseInit } from './ui-message-stream-response-init';

type PipeUIMessageStreamToResponseOptions<
  TOOLS extends ToolSet,
  UI_MESSAGE extends UIMessage,
> = {
  response: ServerResponse;
} & UIMessageStreamResponseInit &
  (
    | {
        stream: ReadableStream<UIMessageChunk>;
      }
    | ({
        stream: ReadableStream<TextStreamPart<TOOLS>>;
        tools?: TOOLS;
      } & UIMessageStreamOptions<UI_MESSAGE>)
  );

/**
 * Pipes a UI message stream to a Node.js ServerResponse object.
 * The stream is transformed to Server-Sent Events (SSE) format.
 *
 * @param options.response - The Node.js ServerResponse object to write to.
 * @param options.status - The HTTP status code for the response.
 * @param options.statusText - The HTTP status text for the response.
 * @param options.headers - Additional HTTP headers to include in the response.
 * @param options.stream - The UI message chunk stream to send.
 * @param options.consumeSseStream - Optional callback to consume a copy of the SSE stream independently.
 */
export function pipeUIMessageStreamToResponse<
  TOOLS extends ToolSet,
  UI_MESSAGE extends UIMessage,
>({
  response,
  status,
  statusText,
  headers,
  stream,
  consumeSseStream,
  ...uiMessageStreamOptions
}: PipeUIMessageStreamToResponseOptions<TOOLS, UI_MESSAGE>): void {
  let sseStream = asUIMessageChunkStream({
    stream,
    ...uiMessageStreamOptions,
  }).pipeThrough(new JsonToSseTransformStream());

  // when the consumeSseStream is provided, we need to tee the stream
  // and send the second part to the consumeSseStream function
  // so that it can be consumed by the client independently
  if (consumeSseStream) {
    const [stream1, stream2] = sseStream.tee();
    sseStream = stream1;
    consumeSseStream({ stream: stream2 }); // no await (do not block the response)
  }

  writeToServerResponse({
    response,
    status,
    statusText,
    headers: Object.fromEntries(
      prepareHeaders(headers, UI_MESSAGE_STREAM_HEADERS).entries(),
    ),
    stream: sseStream.pipeThrough(new TextEncoderStream()),
  });
}

function asUIMessageChunkStream<
  TOOLS extends ToolSet,
  UI_MESSAGE extends UIMessage,
>({
  stream,
  tools,
  sendReasoning = true,
  sendSources = false,
  sendStart = true,
  sendFinish = true,
  onError = getErrorMessage,
  messageMetadata,
  originalMessages,
  generateMessageId,
  onFinish,
}: {
  stream: ReadableStream<UIMessageChunk | TextStreamPart<TOOLS>>;
  tools?: TOOLS;
} & UIMessageStreamOptions<UI_MESSAGE>): ReadableStream<
  InferUIMessageChunk<UI_MESSAGE>
> {
  const responseMessageId =
    generateMessageId != null
      ? getResponseUIMessageId({
          originalMessages,
          responseMessageId: generateMessageId,
        })
      : undefined;

  const uiMessageChunkStream = stream.pipeThrough(
    new TransformStream<
      UIMessageChunk | TextStreamPart<TOOLS>,
      InferUIMessageChunk<UI_MESSAGE>
    >(
      (() => {
        let streamType: 'ui-message' | 'text' | undefined;
        let bufferedChunks: Array<UIMessageChunk | TextStreamPart<TOOLS>> = [];

        const enqueueUIMessageChunk = (
          chunk: UIMessageChunk | TextStreamPart<TOOLS>,
          controller: TransformStreamDefaultController<
            InferUIMessageChunk<UI_MESSAGE>
          >,
        ) => {
          controller.enqueue(chunk as InferUIMessageChunk<UI_MESSAGE>);
        };

        const enqueueTextStreamPart = (
          chunk: UIMessageChunk | TextStreamPart<TOOLS>,
          controller: TransformStreamDefaultController<
            InferUIMessageChunk<UI_MESSAGE>
          >,
        ) => {
          const textStreamPart = chunk as TextStreamPart<TOOLS>;
          const messageMetadataValue = messageMetadata?.({
            part: textStreamPart,
          });
          const uiMessageChunk = toUIMessageChunk<TOOLS, UI_MESSAGE>(
            textStreamPart,
            {
              tools,
              sendReasoning,
              sendSources,
              sendStart,
              sendFinish,
              onError,
              messageMetadata: messageMetadataValue,
              responseMessageId,
            },
          );

          if (uiMessageChunk != null) {
            controller.enqueue(uiMessageChunk);
          }

          // start and finish events already include metadata in the converted
          // chunk; for other part types emit a separate message-metadata chunk
          if (
            messageMetadataValue != null &&
            textStreamPart.type !== 'start' &&
            textStreamPart.type !== 'finish'
          ) {
            controller.enqueue({
              type: 'message-metadata',
              messageMetadata: messageMetadataValue,
            });
          }
        };

        const enqueueChunk = (
          chunk: UIMessageChunk | TextStreamPart<TOOLS>,
          controller: TransformStreamDefaultController<
            InferUIMessageChunk<UI_MESSAGE>
          >,
        ) => {
          if (streamType === 'text') {
            enqueueTextStreamPart(chunk, controller);
          } else {
            enqueueUIMessageChunk(chunk, controller);
          }
        };

        return {
          transform(
            chunk: UIMessageChunk | TextStreamPart<TOOLS>,
            controller: TransformStreamDefaultController<
              InferUIMessageChunk<UI_MESSAGE>
            >,
          ) {
            if (streamType == null) {
              const detectedStreamType = detectStreamType(chunk);

              if (detectedStreamType == null) {
                bufferedChunks.push(chunk);
                return;
              }

              streamType = detectedStreamType;

              for (const bufferedChunk of bufferedChunks) {
                enqueueChunk(bufferedChunk, controller);
              }
              bufferedChunks = [];
            }

            enqueueChunk(chunk, controller);
          },

          flush(
            controller: TransformStreamDefaultController<
              InferUIMessageChunk<UI_MESSAGE>
            >,
          ) {
            streamType ??= 'ui-message';

            for (const bufferedChunk of bufferedChunks) {
              enqueueChunk(bufferedChunk, controller);
            }
          },
        };
      })(),
    ),
  );

  return handleUIMessageStreamFinish<UI_MESSAGE>({
    stream: uiMessageChunkStream,
    messageId: responseMessageId ?? generateMessageId?.(),
    originalMessages,
    onFinish,
    onError,
  });
}

function detectStreamType<TOOLS extends ToolSet>(
  chunk: UIMessageChunk | TextStreamPart<TOOLS>,
): 'ui-message' | 'text' | undefined {
  switch (chunk.type) {
    case 'source':
    case 'tool-call':
    case 'tool-result':
    case 'tool-error':
    case 'tool-input-end':
    case 'raw':
      return 'text';

    case 'text-delta':
    case 'reasoning-delta':
      return 'text' in chunk ? 'text' : 'ui-message';

    case 'tool-input-start':
    case 'tool-input-delta':
      return 'id' in chunk ? 'text' : 'ui-message';

    case 'file':
    case 'reasoning-file':
      return 'file' in chunk ? 'text' : 'ui-message';

    case 'error':
      return 'error' in chunk ? 'text' : 'ui-message';

    case 'start-step':
      return 'request' in chunk ? 'text' : 'ui-message';

    case 'finish-step':
      return 'response' in chunk ? 'text' : 'ui-message';

    case 'finish':
      return 'totalUsage' in chunk ? 'text' : 'ui-message';

    case 'tool-approval-request':
      return 'toolCall' in chunk ? 'text' : 'ui-message';

    case 'tool-input-available':
    case 'tool-input-error':
    case 'tool-output-available':
    case 'tool-output-error':
    case 'source-url':
    case 'source-document':
    case 'message-metadata':
      return 'ui-message';

    default:
      return chunk.type.startsWith('data-') ? 'ui-message' : undefined;
  }
}
