import {
  FetchFunction,
  IdGenerator,
  Schema,
  ToolCall,
} from '@ai-sdk/provider-utils';
import {
  ChatStore,
  ChatStoreOptions,
  InferUIDataParts,
  UIDataPartSchemas,
} from './chat-store';
import { UIMessage } from './ui-messages';

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
  DATA_TYPE_SCHEMAS extends UIDataPartSchemas = UIDataPartSchemas,
> = {
  /**
   * A unique identifier for the chat. If not provided, a random one will be
   * generated. When provided, the `useChat` hook with the same `id` will
   * have shared states across components.
   */
  chatId?: string;

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
    message: UIMessage<MESSAGE_METADATA, InferUIDataParts<DATA_TYPE_SCHEMAS>>;
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
   * Chat store that should be used.
   * It must not change during the component lifecycle.
   *
   * When a ChatStore is provided, it will be used as is.
   * It should be stable and the stability is guaranteed by the user.
   *
   * When a function is provided, it will be called to create a new chat store.
   * The function will be called when the hook is mounted and the chat store will be
   * created.
   * The function will be called with the same arguments as the hook is called with.
   * The function should return a ChatStoreOptions object.
   *
   * When no value is provided, a default chat store will be created.
   */
  chatStore?:
    | ChatStore<MESSAGE_METADATA, DATA_TYPE_SCHEMAS>
    | (() => ChatStoreOptions<MESSAGE_METADATA, DATA_TYPE_SCHEMAS>);
};
