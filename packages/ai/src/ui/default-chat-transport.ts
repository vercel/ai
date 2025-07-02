import { parseJsonEventStream, ParseResult } from '@ai-sdk/provider-utils';
import {
  UIMessageStreamPart,
  uiMessageStreamPartSchema,
} from '../ui-message-stream/ui-message-stream-parts';
import {
  HttpChatTransport,
  HttpChatTransportInitOptions,
} from './http-chat-transport';
import { UIMessage } from './ui-messages';

export class DefaultChatTransport<
  UI_MESSAGE extends UIMessage,
> extends HttpChatTransport<UI_MESSAGE> {
  constructor(options: HttpChatTransportInitOptions<UI_MESSAGE> = {}) {
    super(options);
  }

  protected processResponseStream(
    stream: ReadableStream<Uint8Array<ArrayBufferLike>>,
  ): ReadableStream<UIMessageStreamPart> {
    return parseJsonEventStream({
      stream,
      schema: uiMessageStreamPartSchema,
    }).pipeThrough(
      new TransformStream<
        ParseResult<UIMessageStreamPart>,
        UIMessageStreamPart
      >({
        async transform(part, controller) {
          if (!part.success) {
            throw part.error;
          }
          controller.enqueue(part.value);
        },
      }),
    );
  }
}
