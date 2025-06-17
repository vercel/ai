import { parseJsonEventStream, ParseResult } from '@ai-sdk/provider-utils';
import {
  UIMessageStreamPart,
  uiMessageStreamPartSchema,
} from '../ui-message-stream/ui-message-stream-parts';
import { ChatTransport } from './chat-transport';
import {
  HttpChatTransport,
  HttpChatTransportInitOptions,
} from './http-chat-transport';
import { UIMessage } from './ui-messages';
import { ChatRequestOptions } from './chat';

export class DefaultChatTransport<
  UI_MESSAGE extends UIMessage,
> extends HttpChatTransport<UI_MESSAGE> {
  constructor(options: HttpChatTransportInitOptions<UI_MESSAGE> = {}) {
    super(options);
  }

  async submitMessages({
    abortSignal,
    ...options
  }: Parameters<ChatTransport<UI_MESSAGE>['submitMessages']>[0]) {
    const { headers, body, credentials } =
      this.prepareSubmitMessagesRequest(options);

    const response = await fetch(this.api, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
      credentials,
      signal: abortSignal,
    });

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
