import { parseJsonEventStream, type ParseResult } from '@ai-sdk/provider-utils';
import {
  uiMessageChunkSchema,
  type UIMessageChunk,
} from '../ui-message-stream/ui-message-chunks';
import {
  HttpChatTransport,
  type HttpChatTransportInitOptions,
} from './http-chat-transport';
import type { UIMessage } from './ui-messages';

export class DefaultChatTransport<
  UI_MESSAGE extends UIMessage,
> extends HttpChatTransport<UI_MESSAGE> {
  readonly resumeStreamIsReplay: boolean;

  constructor({
    resumeStreamIsReplay = true,
    ...options
  }: HttpChatTransportInitOptions<UI_MESSAGE> & {
    /**
     * Whether resumed streams replay the response from the beginning.
     * Defaults to true. Set to false for endpoints that only continue the
     * interrupted response, even when they emit a start chunk.
     */
    resumeStreamIsReplay?: boolean;
  } = {}) {
    super(options);
    this.resumeStreamIsReplay = resumeStreamIsReplay;
  }

  protected processResponseStream(
    stream: ReadableStream<Uint8Array<ArrayBufferLike>>,
  ): ReadableStream<UIMessageChunk> {
    return parseJsonEventStream({
      stream,
      schema: uiMessageChunkSchema,
    }).pipeThrough(
      new TransformStream<ParseResult<UIMessageChunk>, UIMessageChunk>({
        async transform(chunk, controller) {
          if (!chunk.success) {
            throw chunk.error;
          }
          controller.enqueue(chunk.value);
        },
      }),
    );
  }
}
