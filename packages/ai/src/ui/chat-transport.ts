import { FetchFunction } from '@ai-sdk/provider-utils';
import { UIMessageStreamPart } from '../ui-message-stream';
import { fetchTextStream, fetchUIMessageStream } from './call-chat-api';
import { UIDataTypes, UIMessage } from './ui-messages';

export interface ChatTransport<
  MESSAGE_METADATA,
  DATA_TYPES extends UIDataTypes,
> {
  submitMessages: (options: {
    chatId: string;
    messages: UIMessage<MESSAGE_METADATA, DATA_TYPES>[];
    abortController: AbortController;
    body?: object;
    headers?: Record<string, string> | Headers;
    requestType: 'generate' | 'resume'; // TODO have separate functions
  }) => Promise<ReadableStream<UIMessageStreamPart>>;
}

export class DefaultChatTransport<
  MESSAGE_METADATA,
  DATA_TYPES extends UIDataTypes,
> implements ChatTransport<MESSAGE_METADATA, DATA_TYPES>
{
  private api: string;
  private credentials?: RequestCredentials;
  private headers?: Record<string, string> | Headers;
  private body?: object;
  private fetch?: FetchFunction;
  private prepareRequestBody?: (options: {
    chatId: string;
    messages: UIMessage<MESSAGE_METADATA, DATA_TYPES>[];
    requestBody?: object;
  }) => unknown;

  constructor({
    api,
    credentials,
    headers,
    body,
    fetch,
    prepareRequestBody,
  }: {
    api: string;

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
    prepareRequestBody?: (options: {
      chatId: string;
      messages: UIMessage<MESSAGE_METADATA, DATA_TYPES>[];
      requestBody?: object;
    }) => unknown;
  }) {
    this.api = api;
    this.credentials = credentials;
    this.headers = headers;
    this.body = body;
    this.fetch = fetch;
    this.prepareRequestBody = prepareRequestBody;
  }

  submitMessages({
    chatId,
    messages,
    abortController,
    body,
    headers,
    requestType,
  }: Parameters<
    ChatTransport<MESSAGE_METADATA, DATA_TYPES>['submitMessages']
  >[0]) {
    return fetchUIMessageStream({
      api: this.api,
      headers: {
        ...this.headers,
        ...headers,
      },
      body: this.prepareRequestBody?.({
        chatId,
        messages,
        ...this.body,
        ...body,
      }) ?? {
        chatId,
        messages,
        ...this.body,
        ...body,
      },
      credentials: this.credentials,
      abortController: () => abortController,
      fetch: this.fetch,
      requestType,
    });
  }
}

export class TextStreamChatTransport<
  MESSAGE_METADATA,
  DATA_TYPES extends UIDataTypes,
> implements ChatTransport<MESSAGE_METADATA, DATA_TYPES>
{
  private api: string;
  private credentials?: RequestCredentials;
  private headers?: Record<string, string> | Headers;
  private body?: object;
  private fetch?: FetchFunction;
  private prepareRequestBody?: (options: {
    chatId: string;
    messages: UIMessage<MESSAGE_METADATA, DATA_TYPES>[];
    requestBody?: object;
  }) => unknown;

  constructor({
    api,
    credentials,
    headers,
    body,
    fetch,
    prepareRequestBody,
  }: {
    api: string;

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
    prepareRequestBody?: (options: {
      chatId: string;
      messages: UIMessage<MESSAGE_METADATA, DATA_TYPES>[];
      requestBody?: object;
    }) => unknown;
  }) {
    this.api = api;
    this.credentials = credentials;
    this.headers = headers;
    this.body = body;
    this.fetch = fetch;
    this.prepareRequestBody = prepareRequestBody;
  }

  submitMessages({
    chatId,
    messages,
    abortController,
    body,
    headers,
    requestType,
  }: Parameters<
    ChatTransport<MESSAGE_METADATA, DATA_TYPES>['submitMessages']
  >[0]) {
    return fetchTextStream({
      api: this.api,
      headers: {
        ...this.headers,
        ...headers,
      },
      body: this.prepareRequestBody?.({
        chatId,
        messages,
        ...this.body,
        ...body,
      }) ?? {
        chatId,
        messages,
        ...this.body,
        ...body,
      },
      credentials: this.credentials,
      abortController: () => abortController,
      fetch: this.fetch,
      requestType,
    });
  }
}
