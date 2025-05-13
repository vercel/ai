import { FetchFunction } from '@ai-sdk/provider-utils';
import { UIMessageStreamPart } from '../ui-message-stream';
import { fetchUIMessageStream } from './call-chat-api';
import { UIMessage } from './ui-messages';

export interface ChatStoreBackend {
  submitMessages: (options: {
    chatId: string;
    messages: UIMessage<unknown>[];
    abortController: AbortController;
    customRequestBody?: object;
    customHeaders?: Record<string, string> | Headers;
    requestType: 'generate' | 'resume'; // TODO have separate functions
  }) => Promise<ReadableStream<UIMessageStreamPart>>;
}

export class DefaultChatStoreBackend implements ChatStoreBackend {
  private api: string;
  private credentials?: RequestCredentials;
  private headers?: Record<string, string> | Headers;
  private body?: object;
  private streamProtocol?: 'ui-message' | 'text';
  private fetch?: FetchFunction;
  private prepareRequestBody?: (options: {
    id: string;
    messages: UIMessage<unknown>[];
    requestBody?: object;
  }) => unknown;

  constructor({
    api,
    credentials,
    headers,
    body,
    streamProtocol,
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
  Streaming protocol that is used. Defaults to `ui-message`.
     */
    streamProtocol?: 'ui-message' | 'text';

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
      id: string;
      messages: UIMessage<unknown>[];
      requestBody?: object;
    }) => unknown;
  }) {
    this.api = api;
    this.credentials = credentials;
    this.headers = headers;
    this.body = body;
    this.streamProtocol = streamProtocol;
    this.fetch = fetch;
    this.prepareRequestBody = prepareRequestBody;
  }

  submitMessages({
    chatId,
    messages,
    abortController,
    customRequestBody,
    customHeaders,
    requestType,
  }: Parameters<ChatStoreBackend['submitMessages']>[0]) {
    return fetchUIMessageStream({
      api: this.api,
      headers: {
        ...this.headers,
        ...customHeaders,
      },
      body: this.prepareRequestBody?.({
        id: chatId, // TODO change to chatId
        messages,
        requestBody: customRequestBody,
      }) ?? {
        id: chatId, // TODO change to chatId
        messages,
        ...customRequestBody,
      },
      streamProtocol: this.streamProtocol,
      credentials: this.credentials,
      abortController: () => abortController,
      fetch: this.fetch,
      requestType,
    });
  }
}
