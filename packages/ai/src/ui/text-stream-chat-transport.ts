import { UIMessageStreamPart } from '../ui-message-stream/ui-message-stream-parts';
import {
  HttpChatTransport,
  HttpChatTransportInitOptions,
} from './http-chat-transport';
import { transformTextToUiMessageStream } from './transform-text-to-ui-message-stream';
import { UIMessage } from './ui-messages';
import { ChatRequestOptions } from './chat';

export class TextStreamChatTransport<
  UI_MESSAGE extends UIMessage,
> extends HttpChatTransport<UI_MESSAGE> {
  constructor(options: HttpChatTransportInitOptions<UI_MESSAGE> = {}) {
    super(options);
  }

  async reconnectToStream(
    options: Parameters<
      (
        options: { chatId: string } & ChatRequestOptions,
      ) => Promise<ReadableStream<UIMessageStreamPart> | null>
    >[0],
  ): Promise<ReadableStream<UIMessageStreamPart> | null> {
    const preparedRequest = this.prepareRequest?.({
      id: options.chatId,
      messages: [], // TODO prepareRequest needs type
      body: { ...this.body, ...options.body },
      headers: { ...this.headers, ...options.headers },
      credentials: this.credentials,
      requestMetadata: options.metadata,
    });

    const response = await fetch(`${this.api}/${options.chatId}/stream`, {
      method: 'GET',
      headers:
        preparedRequest?.headers !== undefined
          ? preparedRequest.headers
          : { ...this.headers, ...options.headers },
      credentials: preparedRequest?.credentials ?? this.credentials,
    });

    // no active stream found, so we do not resume
    if (response.status === 204) {
      return null;
    }

    if (!response.ok) {
      throw new Error(
        (await response.text()) ?? 'Failed to fetch the chat response.',
      );
    }

    if (!response.body) {
      throw new Error('The response body is empty.');
    }

    return this.processResponseStream(response.body);
  }

  protected processResponseStream(
    stream: ReadableStream<Uint8Array<ArrayBufferLike>>,
  ): ReadableStream<UIMessageStreamPart> {
    return transformTextToUiMessageStream({
      stream: stream.pipeThrough(new TextDecoderStream()),
    });
  }
}
