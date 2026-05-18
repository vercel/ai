import type { ToolSet } from '@ai-sdk/provider-utils';
import type { ServerResponse } from 'node:http';
import type {
  TextStreamPart,
  UIMessageStreamOptions,
} from '../generate-text/stream-text-result';
import type { UIMessage } from '../ui/ui-messages';
import { pipeUIMessageStreamToResponse } from './pipe-ui-message-stream-to-response';
import { toUIMessageChunkStream } from './to-ui-message-chunk-stream';
import type { UIMessageStreamResponseInit } from './ui-message-stream-response-init';

/**
 * Pipes a stream of `TextStreamPart<TOOLS>` chunks (as emitted by
 * `streamText`'s `fullStream`) to a Node.js ServerResponse object as a UI
 * message stream.
 *
 * The stream is converted to UI message chunks and then transformed to
 * Server-Sent Events (SSE) format.
 */
export function pipeTextStreamToUIMessageStreamResponse<
  TOOLS extends ToolSet,
  UI_MESSAGE extends UIMessage,
>({
  response,
  stream,
  tools,
  status,
  statusText,
  headers,
  consumeSseStream,
  ...options
}: {
  response: ServerResponse;
  stream: ReadableStream<TextStreamPart<TOOLS>>;
  tools?: TOOLS;
} & UIMessageStreamResponseInit &
  UIMessageStreamOptions<UI_MESSAGE>): void {
  pipeUIMessageStreamToResponse({
    response,
    status,
    statusText,
    headers,
    consumeSseStream,
    stream: toUIMessageChunkStream({
      stream,
      tools,
      ...options,
    }),
  });
}
