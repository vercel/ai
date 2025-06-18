import { FetchFunction } from '@ai-sdk/provider-utils';
import { UIMessageStreamPart } from '../ui-message-stream/ui-message-stream-parts';
import { ChatTransport } from './chat-transport';
import { UIMessage } from './ui-messages';

// use function to allow for mocking in tests:
const getOriginalFetch = () => fetch;

export type PrepareSendMessagesRequest<UI_MESSAGE extends UIMessage> = (
  options: {
    id: string;
    messages: UI_MESSAGE[];
    requestMetadata: unknown;
    body: Record<string, any> | undefined;
    credentials: RequestCredentials | undefined;
    headers: HeadersInit | undefined;
    api: string;
  } & {
    trigger:
      | 'submit-user-message'
      | 'submit-tool-result'
      | 'regenerate-assistant-message';
    messageId: string | undefined;
  },
) => {
  body: object;
  headers?: HeadersInit;
  credentials?: RequestCredentials;
  api?: string;
};

export type PrepareReconnectToStreamRequest = (options: {
  id: string;
  requestMetadata: unknown;
  body: Record<string, any> | undefined;
  credentials: RequestCredentials | undefined;
  headers: HeadersInit | undefined;
  api: string;
}) => {
  headers?: HeadersInit;
  credentials?: RequestCredentials;
  api?: string;
};

export type HttpChatTransportInitOptions<UI_MESSAGE extends UIMessage> = {
  api?: string;

  /**
   * The credentials mode to be used for the fetch request.
   * Possible values are: 'omit', 'same-origin', 'include'.
   * Defaults to 'same-origin'.
   */
  credentials?: RequestCredentials;

  /**
   * HTTP headers to be sent with the API request.
   */
  headers?: Record<string, string> | Headers;

  /**
   * Extra body object to be sent with the API request.
   * @example
   * Send a `sessionId` to the API along with the messages.
   * ```js
   * useChat({
   *   body: {
   *     sessionId: '123',
   *   }
   * })
   * ```
   */
  body?: object;

  /**
  Custom fetch implementation. You can use it as a middleware to intercept requests,
  or to provide a custom fetch implementation for e.g. testing.
      */
  fetch?: FetchFunction;

  /**
   * When a function is provided, it will be used
   * to prepare the request body for the chat API. This can be useful for
   * customizing the request body based on the messages and data in the chat.
   *
   * @param id The id of the chat.
   * @param messages The current messages in the chat.
   * @param requestBody The request body object passed in the chat request.
   */
  prepareSendMessagesRequest?: PrepareSendMessagesRequest<UI_MESSAGE>;

  prepareReconnectToStreamRequest?: PrepareReconnectToStreamRequest;
};

export abstract class HttpChatTransport<UI_MESSAGE extends UIMessage>
  implements ChatTransport<UI_MESSAGE>
{
  protected api: string;
  protected credentials?: RequestCredentials;
  protected headers?: Record<string, string> | Headers;
  protected body?: object;
  protected fetch: FetchFunction;
  protected prepareSendMessagesRequest?: PrepareSendMessagesRequest<UI_MESSAGE>;
  protected prepareReconnectToStreamRequest?: PrepareReconnectToStreamRequest;

  constructor({
    api = '/api/chat',
    credentials,
    headers,
    body,
    fetch = getOriginalFetch(),
    prepareSendMessagesRequest,
    prepareReconnectToStreamRequest,
  }: HttpChatTransportInitOptions<UI_MESSAGE>) {
    this.api = api;
    this.credentials = credentials;
    this.headers = headers;
    this.body = body;
    this.fetch = fetch;
    this.prepareSendMessagesRequest = prepareSendMessagesRequest;
    this.prepareReconnectToStreamRequest = prepareReconnectToStreamRequest;
  }

  async sendMessages({
    abortSignal,
    ...options
  }: Parameters<ChatTransport<UI_MESSAGE>['sendMessages']>[0]) {
    const preparedRequest = this.prepareSendMessagesRequest?.({
      api: this.api,
      id: options.chatId,
      messages: options.messages,
      body: { ...this.body, ...options.body },
      headers: { ...this.headers, ...options.headers },
      credentials: this.credentials,
      requestMetadata: options.metadata,
      trigger: options.trigger,
      messageId: options.messageId,
    });

    const api = preparedRequest?.api ?? this.api;
    const headers =
      preparedRequest?.headers !== undefined
        ? preparedRequest.headers
        : { ...this.headers, ...options.headers };
    const body =
      preparedRequest?.body !== undefined
        ? preparedRequest.body
        : {
            ...this.body,
            ...options.body,
            id: options.chatId,
            messages: options.messages,
            trigger: options.trigger,
            messageId: options.messageId,
          };
    const credentials = preparedRequest?.credentials ?? this.credentials;

    const response = await fetch(api, {
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
    options: Parameters<ChatTransport<UI_MESSAGE>['reconnectToStream']>[0],
  ): Promise<ReadableStream<UIMessageStreamPart> | null> {
    const preparedRequest = this.prepareReconnectToStreamRequest?.({
      api: this.api,
      id: options.chatId,
      body: { ...this.body, ...options.body },
      headers: { ...this.headers, ...options.headers },
      credentials: this.credentials,
      requestMetadata: options.metadata,
    });

    const api = preparedRequest?.api ?? `${this.api}/${options.chatId}/stream`;
    const headers =
      preparedRequest?.headers !== undefined
        ? preparedRequest.headers
        : { ...this.headers, ...options.headers };
    const credentials = preparedRequest?.credentials ?? this.credentials;

    const response = await fetch(api, {
      method: 'GET',
      headers,
      credentials,
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

  protected abstract processResponseStream(
    stream: ReadableStream<Uint8Array<ArrayBufferLike>>,
  ): ReadableStream<UIMessageStreamPart>;
}
