import { FetchFunction } from '@ai-sdk/provider-utils';
import { UIMessageStreamPart } from '../ui-message-stream/ui-message-stream-parts';
import { ChatTransport } from './chat-transport';
import {
  HttpChatTransport,
  HttpChatTransportInitOptions,
} from './http-chat-transport';
import { transformTextToUiMessageStream } from './transform-text-to-ui-message-stream';
import { UIMessage } from './ui-messages';
import { ChatRequestOptions } from './chat';

async function fetchTextStream({
  api,
  body,
  credentials,
  headers,
  abortSignal,
  fetch,
  requestType = 'generate',
}: {
  api: string;
  body: Record<string, any>;
  credentials: RequestCredentials | undefined;
  headers: HeadersInit | undefined;
  abortSignal: AbortSignal | undefined;
  fetch: FetchFunction;
  requestType?: 'generate' | 'resume';
}): Promise<ReadableStream<UIMessageStreamPart<never, never>>> {
  const response =
    requestType === 'resume'
      ? await fetch(`${api}/${body.chatId}/stream`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          signal: abortSignal,
          credentials,
        })
      : await fetch(api, {
          method: 'POST',
          body: JSON.stringify(body),
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          signal: abortSignal,
          credentials,
        });

  if (!response.ok) {
    throw new Error(
      (await response.text()) ?? 'Failed to fetch the chat response.',
    );
  }

  if (!response.body) {
    throw new Error('The response body is empty.');
  }

  return transformTextToUiMessageStream({
    stream: response.body.pipeThrough(new TextDecoderStream()),
  });
}

export class TextStreamChatTransport<
  UI_MESSAGE extends UIMessage,
> extends HttpChatTransport<UI_MESSAGE> {
  constructor(options: HttpChatTransportInitOptions<UI_MESSAGE> = {}) {
    super(options);
  }

  submitMessages({
    chatId,
    messages,
    abortSignal,
    metadata,
    headers,
    body,
  }: Parameters<ChatTransport<UI_MESSAGE>['submitMessages']>[0]) {
    const preparedRequest = this.prepareRequest?.({
      id: chatId,
      messages,
      body: { ...this.body, ...body },
      headers: { ...this.headers, ...headers },
      credentials: this.credentials,
      requestMetadata: metadata,
    });

    return fetchTextStream({
      api: this.api,

      body:
        preparedRequest?.body !== undefined
          ? preparedRequest.body
          : { ...this.body, ...body },
      headers:
        preparedRequest?.headers !== undefined
          ? preparedRequest.headers
          : { ...this.headers, ...headers },
      credentials: preparedRequest?.credentials ?? this.credentials,
      abortSignal,
      fetch: this.fetch,
      requestType: 'generate',
    });
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

    return transformTextToUiMessageStream({
      stream: response.body.pipeThrough(new TextDecoderStream()),
    });
  }
}
