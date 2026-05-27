import type { ToolSet } from '@ai-sdk/provider-utils';
import type {
  TextStreamPart,
  UIMessageStreamOptions,
} from '../generate-text/stream-text-result';
import type { UIMessage } from '../ui/ui-messages';
import { createUIMessageStreamResponse } from './create-ui-message-stream-response';
import { toUIMessageChunkStream } from './to-ui-message-chunk-stream';
import type { UIMessageStreamResponseInit } from './ui-message-stream-response-init';

/**
 * Creates a Response object from a stream of `TextStreamPart<TOOLS>` chunks (as
 * emitted by `streamText`'s `fullStream`).
 *
 * The stream is converted to UI message chunks and then transformed to
 * Server-Sent Events (SSE) format.
 */
export function toUIMessageChunkStreamResponse<
  TOOLS extends ToolSet,
  UI_MESSAGE extends UIMessage,
>({
  stream,
  tools,
  ...options
}: {
  stream: ReadableStream<TextStreamPart<TOOLS>>;
  tools?: TOOLS;
} & UIMessageStreamResponseInit &
  UIMessageStreamOptions<UI_MESSAGE>): Response {
  return createUIMessageStreamResponse({
    stream: toUIMessageChunkStream({
      stream,
      tools,
      ...options,
    }),
    ...options,
  });
}
