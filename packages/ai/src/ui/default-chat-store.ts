import {
  FetchFunction,
  generateId as generateIdFunc,
  IdGenerator,
  Schema,
} from '@ai-sdk/provider-utils';
import {
  ChatStore,
  InferUIDataTypes,
  type UIDataTypesSchemas,
} from './chat-store';
import { DefaultChatTransport } from './chat-transport';
import { UIMessage } from './ui-messages';

export function defaultChatStore<
  MESSAGE_METADATA,
  UI_DATA_TYPE_SCHEMAS extends UIDataTypesSchemas,
>({
  api,
  fetch,
  streamProtocol = 'ui-message',
  credentials,
  headers,
  body,
  prepareRequestBody,
  generateId = generateIdFunc,
  dataTypeSchemas,
  messageMetadataSchema,
  maxSteps = 1,
  chats,
}: {
  /**
   * Schema for the message metadata. Validates the message metadata.
   * Message metadata can be undefined or must match the schema.
   */
  messageMetadataSchema?: Schema<MESSAGE_METADATA>;

  /**
   * Schema for the data types. Validates the data types.
   */
  dataTypeSchemas?: UI_DATA_TYPE_SCHEMAS;

  /**
   * The API endpoint that accepts a `{ messages: Message[] }` object and returns
   * a stream of tokens of the AI chat response.
   */
  api: string;

  /**
   * A way to provide a function that is going to be used for ids for messages and the chat.
   * If not provided the default AI SDK `generateId` is used.
   */
  generateId?: IdGenerator;

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
    Maximum number of sequential LLM calls (steps), e.g. when you use tool calls.
    Must be at least 1.

    A maximum number is required to prevent infinite loops in the case of misconfigured tools.

    By default, it's set to 1, which means that only a single LLM call is made.
     */
  maxSteps?: number;

  /**
   * When a function is provided, it will be used
   * to prepare the request body for the chat API. This can be useful for
   * customizing the request body based on the messages and data in the chat.
   *
   * @param chatId The id of the chat.
   * @param messages The current messages in the chat.
   * @param requestBody The request body object passed in the chat request.
   */
  prepareRequestBody?: (options: {
    chatId: string;
    messages: UIMessage<
      MESSAGE_METADATA,
      InferUIDataTypes<UI_DATA_TYPE_SCHEMAS>
    >[];
    requestBody?: object;
  }) => unknown;

  chats?: {
    [id: string]: {
      messages: UIMessage<
        MESSAGE_METADATA,
        InferUIDataTypes<UI_DATA_TYPE_SCHEMAS>
      >[];
    };
  };
}): ChatStore<MESSAGE_METADATA, UI_DATA_TYPE_SCHEMAS> {
  return new ChatStore<MESSAGE_METADATA, UI_DATA_TYPE_SCHEMAS>({
    transport: new DefaultChatTransport<
      MESSAGE_METADATA,
      InferUIDataTypes<UI_DATA_TYPE_SCHEMAS>
    >({
      api,
      fetch,
      streamProtocol,
      credentials,
      headers,
      body,
      prepareRequestBody,
    }),
    generateId,
    messageMetadataSchema,
    dataTypeSchemas,
    maxSteps,
    chats,
  });
}
