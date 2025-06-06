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
import { UIDataTypes, UIMessage } from './ui-messages';
import { PrepareChatRequestFunction } from './prepare-chat-request';

// use function to allow for mocking in tests:
const getOriginalFetch = () => fetch;

async function fetchUIMessageStream({
  api,
  body,
  credentials,
  headers,
  abortController,
  fetch = getOriginalFetch(),
  requestType = 'generate',
}: {
  api: string;
  body: Record<string, any>;
  credentials: RequestCredentials | undefined;
  headers: HeadersInit | undefined;
  abortController: (() => AbortController | null) | undefined;
  fetch: ReturnType<typeof getOriginalFetch> | undefined;
  requestType?: 'generate' | 'resume';
}): Promise<ReadableStream<UIMessageStreamPart>> {
  const response =
    requestType === 'resume'
      ? await fetch(`${api}?chatId=${body.chatId}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          signal: abortController?.()?.signal,
          credentials,
        })
      : await fetch(api, {
          method: 'POST',
          body: JSON.stringify(body),
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          signal: abortController?.()?.signal,
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
  private prepareChatRequest: PrepareChatRequestFunction<
    MESSAGE_METADATA,
    DATA_TYPES
  >;

  constructor({
    api = '/api/chat',
    credentials,
    headers,
    body,
    fetch,
    prepareChatRequest = ({ id, messages, body }) => ({
      body: { id, messages, ...body },
    }),
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
    prepareChatRequest?: PrepareChatRequestFunction<
      MESSAGE_METADATA,
      DATA_TYPES
    >;
  } = {}) {
    this.api = api;
    this.credentials = credentials;
    this.headers = headers;
    this.body = body;
    this.fetch = fetch;
    this.prepareChatRequest = prepareChatRequest;
  }

  submitMessages({
    chatId,
    messages,
    abortController,
    requestMetadata,
    requestType,
  }: Parameters<
    ChatTransport<MESSAGE_METADATA, DATA_TYPES>['submitMessages']
  >[0]) {
    const { headers, body, credentials } = this.prepareChatRequest({
      id: chatId,
      messages,
      requestMetadata,
      body: this.body,
      credentials: this.credentials,
      headers: this.headers,
    });

    return fetchUIMessageStream({
      api: this.api,

      // overriding headers and credentials in prepareChatRequest is optional
      headers: headers !== undefined ? headers : this.headers,
      credentials: credentials !== undefined ? credentials : this.credentials,

      body,
      abortController: () => abortController, // TODO: why is this a function?
      fetch: this.fetch,
      requestType,
    });
  }
}
