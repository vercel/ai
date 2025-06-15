import { FetchFunction } from '@ai-sdk/provider-utils';
import { UIMessageStreamPart } from '../ui-message-stream/ui-message-stream-parts';
import { ChatTransport } from './chat-transport';
import { PrepareRequest } from './prepare-request';
import { UIMessage } from './ui-messages';

// use function to allow for mocking in tests:
const getOriginalFetch = () => fetch;

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
  prepareRequest?: NoInfer<PrepareRequest<UI_MESSAGE>>;
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

  abstract submitMessages(
    options: Parameters<ChatTransport<UI_MESSAGE>['submitMessages']>[0],
  ): Promise<ReadableStream<UIMessageStreamPart>>;
}
