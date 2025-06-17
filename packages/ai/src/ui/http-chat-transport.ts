import { FetchFunction } from '@ai-sdk/provider-utils';
import { UIMessageStreamPart } from '../ui-message-stream/ui-message-stream-parts';
import { ChatTransport } from './chat-transport';
import { UIMessage } from './ui-messages';

// use function to allow for mocking in tests:
const getOriginalFetch = () => fetch;

export type PrepareRequest<UI_MESSAGE extends UIMessage> = (options: {
  id: string;
  messages: UI_MESSAGE[];
  requestMetadata: unknown;
  body: Record<string, any> | undefined;
  credentials: RequestCredentials | undefined;
  headers: HeadersInit | undefined;
}) => {
  body: object;
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
  prepareRequest?: PrepareRequest<UI_MESSAGE>;
};

export abstract class HttpChatTransport<UI_MESSAGE extends UIMessage>
  implements ChatTransport<UI_MESSAGE>
{
  protected api: string;
  protected credentials?: RequestCredentials;
  protected headers?: Record<string, string> | Headers;
  protected body?: object;
  protected fetch: FetchFunction;
  protected prepareRequest?: PrepareRequest<UI_MESSAGE>;

  constructor({
    api = '/api/chat',
    credentials,
    headers,
    body,
    fetch = getOriginalFetch(),
    prepareRequest,
  }: HttpChatTransportInitOptions<UI_MESSAGE>) {
    this.api = api;
    this.credentials = credentials;
    this.headers = headers;
    this.body = body;
    this.fetch = fetch;
    this.prepareRequest = prepareRequest;
  }

  private prepareSubmitMessagesRequest({
    chatId,
    messages,
    metadata,
    headers,
    body,
  }: Omit<
    Parameters<ChatTransport<UI_MESSAGE>['submitMessages']>[0],
    'abortSignal'
  >) {
    const preparedRequest = this.prepareRequest?.({
      id: chatId,
      messages,
      body: { ...this.body, ...body },
      headers: { ...this.headers, ...headers },
      credentials: this.credentials,
      requestMetadata: metadata,
    });

    return {
      api: preparedRequest?.api ?? this.api,
      headers:
        preparedRequest?.headers !== undefined
          ? preparedRequest.headers
          : { ...this.headers, ...headers },
      body:
        preparedRequest?.body !== undefined
          ? preparedRequest.body
          : { ...this.body, ...body, id: chatId, messages },
      credentials: preparedRequest?.credentials ?? this.credentials,
    };
  }

  async submitMessages({
    abortSignal,
    ...options
  }: Parameters<ChatTransport<UI_MESSAGE>['submitMessages']>[0]) {
    const { api, headers, body, credentials } =
      this.prepareSubmitMessagesRequest(options);

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

  private prepareReconnectToStreamRequest(
    options: Parameters<ChatTransport<UI_MESSAGE>['reconnectToStream']>[0],
  ) {
    const preparedRequest = this.prepareRequest?.({
      id: options.chatId,
      messages: [], // TODO prepareRequest needs type
      body: { ...this.body, ...options.body },
      headers: { ...this.headers, ...options.headers },
      credentials: this.credentials,
      requestMetadata: options.metadata,
    });

    return {
      api: preparedRequest?.api ?? `${this.api}/${options.chatId}/stream`,
      headers:
        preparedRequest?.headers !== undefined
          ? preparedRequest.headers
          : { ...this.headers, ...options.headers },
      credentials: preparedRequest?.credentials ?? this.credentials,
    };
  }

  async reconnectToStream(
    options: Parameters<ChatTransport<UI_MESSAGE>['reconnectToStream']>[0],
  ): Promise<ReadableStream<UIMessageStreamPart> | null> {
    const { api, headers, credentials } =
      this.prepareReconnectToStreamRequest(options);

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
