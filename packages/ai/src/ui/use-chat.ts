import { JSONValue, LanguageModelV2FinishReason } from '@ai-sdk/provider';
import { FetchFunction, IdGenerator, ToolCall } from '@ai-sdk/provider-utils';
import { LanguageModelUsage } from '../../core/types/usage';
import { UIMessage } from './ui-messages';

export type ChatRequest = {
  /**
  An optional object of headers to be passed to the API endpoint.
   */
  headers?: Record<string, string> | Headers;

  /**
  An optional object to be passed to the API endpoint.
  */
  body?: object;

  /**
  The messages of the chat.
     */
  messages: UIMessage[];

  /**
  Additional data to be sent to the server.
     */
  data?: JSONValue;
};

// Note: only used in useCompletion
export type RequestOptions = {
  /**
  An optional object of headers to be passed to the API endpoint.
   */
  headers?: Record<string, string> | Headers;

  /**
  An optional object to be passed to the API endpoint.
     */
  body?: object;
};

export type ChatRequestOptions = {
  /**
  Additional headers that should be to be passed to the API endpoint.
   */
  headers?: Record<string, string> | Headers;

  /**
  Additional body JSON properties that should be sent to the API endpoint.
   */
  body?: object;

  /**
  Additional data to be sent to the API endpoint.
     */
  data?: JSONValue;

  /**
   * Allow submitting an empty message. Defaults to `false`.
   */
  allowEmptySubmit?: boolean;
};

export type UseChatOptions = {
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
  initialMessages?: UIMessage[];

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
   * Callback function to be called when the API response is received.
   */
  onResponse?: (response: Response) => void | Promise<void>;

  /**
   * Optional callback function that is called when the assistant message is finished streaming.
   *
   * @param message The message that was streamed.
   * @param options.usage The token usage of the message.
   * @param options.finishReason The finish reason of the message.
   */
  onFinish?: (
    message: UIMessage,
    options: {
      usage: LanguageModelUsage;
      finishReason: LanguageModelV2FinishReason;
    },
  ) => void;

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
  Streaming protocol that is used. Defaults to `data`.
     */
  streamProtocol?: 'data' | 'text';

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
