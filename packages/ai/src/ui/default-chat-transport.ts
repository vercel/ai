import {
  FetchFunction,
  parseJsonEventStream,
  ParseResult,
} from '@ai-sdk/provider-utils';
import {
  UIMessageStreamPart,
  uiMessageStreamPartSchema,
} from '../ui-message-stream/ui-message-stream-parts';
import { ChatTransport } from './chat-transport';
import { PrepareRequest } from './prepare-request';
import { UIDataTypes } from './ui-messages';

// use function to allow for mocking in tests:
const getOriginalFetch = () => fetch;

async function fetchUIMessageStream({
  api,
  body,
  credentials,
  headers,
  abortSignal,
  fetch = getOriginalFetch(),
  requestType = 'generate',
}: {
  api: string;
  body: Record<string, any>;
  credentials: RequestCredentials | undefined;
  headers: HeadersInit | undefined;
  abortSignal: AbortSignal | undefined;
  fetch: ReturnType<typeof getOriginalFetch> | undefined;
  requestType?: 'generate' | 'resume';
}): Promise<ReadableStream<UIMessageStreamPart>> {
  const response =
    requestType === 'resume'
      ? await fetch(`${api}?id=${body.id}`, {
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

  return parseJsonEventStream({
    stream: response.body,
    schema: uiMessageStreamPartSchema,
  }).pipeThrough(
    new TransformStream<ParseResult<UIMessageStreamPart>, UIMessageStreamPart>({
      async transform(part, controller) {
        if (!part.success) {
          throw part.error;
        }
        controller.enqueue(part.value);
      },
    }),
  );
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
  private prepareRequest?: PrepareRequest<MESSAGE_METADATA, DATA_TYPES>;

  constructor({
    api = '/api/chat',
    credentials,
    headers,
    body,
    fetch,
    prepareRequest,
  }: {
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
    prepareRequest?: PrepareRequest<MESSAGE_METADATA, DATA_TYPES>;
  } = {}) {
    this.api = api;
    this.credentials = credentials;
    this.headers = headers;
    this.body = body;
    this.fetch = fetch;
    this.prepareRequest = prepareRequest;
  }

  submitMessages({
    chatId,
    messages,
    abortSignal,
    metadata,
    headers,
    body,
    requestType,
  }: Parameters<
    ChatTransport<MESSAGE_METADATA, DATA_TYPES>['submitMessages']
  >[0]) {
    const preparedRequest = this.prepareRequest?.({
      id: chatId,
      messages,
      body: { ...this.body, ...body },
      headers: { ...this.headers, ...headers },
      credentials: this.credentials,
      requestMetadata: metadata,
    });

    return fetchUIMessageStream({
      api: this.api,
      body:
        preparedRequest?.body !== undefined
          ? preparedRequest.body
          : { ...this.body, ...body, id: chatId, messages },
      headers:
        preparedRequest?.headers !== undefined
          ? preparedRequest.headers
          : { ...this.headers, ...headers },
      credentials: preparedRequest?.credentials ?? this.credentials,
      abortSignal,
      fetch: this.fetch,
      requestType,
    });
  }
}
