import {
  FetchFunction,
  IdGenerator,
  Schema,
  ToolCall,
} from '@ai-sdk/provider-utils';
import { ChatStore } from './chat-store';
import { UIDataTypes, UIMessage } from './ui-messages';

export type ChatRequestOptions = {
  /**
  Additional headers that should be to be passed to the API endpoint.
   */
  headers?: Record<string, string> | Headers;

  /**
  Additional body JSON properties that should be sent to the API endpoint.
   */
  body?: object;
};

export type UseChatOptions<
  MESSAGE_METADATA = unknown,
  DATA_TYPES extends UIDataTypes = UIDataTypes,
> = {
  /**
   * A unique identifier for the chat. If not provided, a random one will be
   * generated. When provided, the `useChat` hook with the same `id` will
   * have shared states across components.
   */
  id?: string;

  /**
   * Initial input of the chat.
   */
  initialInput?: string;

  /**
  Optional callback function that is invoked when a tool call is received.
  Intended for automatic client-side tool execution.

  You can optionally return a result for the tool call,
  either synchronously or asynchronously.
     */
  onToolCall?: ({
    toolCall,
  }: {
    toolCall: ToolCall<string, unknown>;
  }) => void | Promise<unknown> | unknown;

  /**
   * Optional callback function that is called when the assistant message is finished streaming.
   *
   * @param message The message that was streamed.
   */
  onFinish?: (options: {
    message: UIMessage<MESSAGE_METADATA, DATA_TYPES>;
  }) => void;

  /**
   * Callback function to be called when an error is encountered.
   */
  onError?: (error: Error) => void;

  /**
   * A way to provide a function that is going to be used for ids for messages and the chat.
   * If not provided the default AI SDK `generateId` is used.
   */
  generateId?: IdGenerator;

  /**
   * Optional chat store. Default is used when not provided.
   */
  chatStore?: ChatStore<MESSAGE_METADATA, DATA_TYPES>;
};

export type OriginalUseChatOptions<MESSAGE_METADATA = unknown> = {
  /**
   * Schema for the message metadata. Validates the message metadata.
   * Message metadata can be undefined or must match the schema.
   */
  messageMetadataSchema?: Schema<MESSAGE_METADATA>;

  /**
   * The API endpoint that accepts a `{ messages: Message[] }` object and returns
   * a stream of tokens of the AI chat response. Defaults to `/api/chat`.
   */
  api?: string;

  /**
   * A unique identifier for the chat. If not provided, a random one will be
   * generated. When provided, the `useChat` hook with the same `id` will
   * have shared states across components.
   */
  id?: string;

  /**
   * Initial messages of the chat. Useful to load an existing chat history.
   */
  initialMessages?: UIMessage<NoInfer<MESSAGE_METADATA>>[];

  /**
   * Initial input of the chat.
   */
  initialInput?: string;

  /**
  Optional callback function that is invoked when a tool call is received.
  Intended for automatic client-side tool execution.

  You can optionally return a result for the tool call,
  either synchronously or asynchronously.
     */
  onToolCall?: ({
    toolCall,
  }: {
    toolCall: ToolCall<string, unknown>;
  }) => void | Promise<unknown> | unknown;

  /**
   * Optional callback function that is called when the assistant message is finished streaming.
   *
   * @param message The message that was streamed.
   */
  onFinish?: (options: {
    message: UIMessage<NoInfer<MESSAGE_METADATA>>;
  }) => void;

  /**
   * Callback function to be called when an error is encountered.
   */
  onError?: (error: Error) => void;

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
};
