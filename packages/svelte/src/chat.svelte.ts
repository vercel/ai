import {
  convertFileListToFileUIParts,
  generateId,
  type ChatRequestOptions,
  type CreateUIMessage,
  type IdGenerator,
  type UIMessage,
  type UseChatOptions,
} from 'ai';
import {
  ChatStore,
  defaultChatStore,
  getChatStoreContext,
  hasChatStoreContext,
} from './chat-store.svelte.js';
import type {
  ChatStatus,
  InferUIDataParts,
  UIDataPartSchemas,
} from 'ai/internal';

export type ChatOptions<
  MESSAGE_METADATA = unknown,
  DATA_PART_SCHEMAS extends UIDataPartSchemas = UIDataPartSchemas,
> = Readonly<UseChatOptions<MESSAGE_METADATA, DATA_PART_SCHEMAS>>;

export type { CreateUIMessage, UIMessage };

export class Chat<
  MESSAGE_METADATA = unknown,
  DATA_PART_SCHEMAS extends UIDataPartSchemas = UIDataPartSchemas,
> {
  readonly #options: ChatOptions<MESSAGE_METADATA, DATA_PART_SCHEMAS>;
  readonly #generateId: IdGenerator;
  readonly #chatStore: ChatStore<MESSAGE_METADATA, DATA_PART_SCHEMAS>;
  /**
   * The id of the chat. If not provided through the constructor, a random ID will be generated
   * using the provided `generateId` function, or a built-in function if not provided.
   */
  readonly chatId: string;

  /** The current value of the input. Writable, so it can be bound to form inputs. */
  input = $state<string>('');

  /**
   * Current messages in the chat.
   *
   * This is writable, which is useful when you want to edit the messages on the client, and then
   * trigger {@link reload} to regenerate the AI response.
   */
  get messages(): UIMessage<
    MESSAGE_METADATA,
    InferUIDataParts<DATA_PART_SCHEMAS>
  >[] {
    return this.#chatStore.getMessages(this.chatId);
  }
  set messages(
    messages: UIMessage<
      MESSAGE_METADATA,
      InferUIDataParts<DATA_PART_SCHEMAS>
    >[],
  ) {
    this.#chatStore.setMessages({ id: this.chatId, messages });
  }

  /**
   * Hook status:
   *
   * - `submitted`: The message has been sent to the API and we're awaiting the start of the response stream.
   * - `streaming`: The response is actively streaming in from the API, receiving chunks of data.
   * - `ready`: The full response has been received and processed; a new user message can be submitted.
   * - `error`: An error occurred during the API request, preventing successful completion.
   */
  get status(): ChatStatus {
    return this.#chatStore.getStatus(this.chatId);
  }
  set status(value: ChatStatus) {
    this.#chatStore.setStatus({ id: this.chatId, status: value });
  }

  /** The error object of the API request */
  get error(): Error | undefined {
    return this.#chatStore.getError(this.chatId);
  }
  set error(value: Error | undefined) {
    this.#chatStore.setStatus({
      id: this.chatId,
      status: 'error',
      error: value,
    });
  }

  constructor(
    options: () => ChatOptions<
      MESSAGE_METADATA,
      DATA_PART_SCHEMAS
    > = () => ({}),
  ) {
    this.#options = $derived.by(options);
    this.#generateId = $derived(this.#options.generateId ?? generateId);
    this.chatId = $derived(this.#options.chatId ?? this.#generateId());

    if (this.#options.chatStore) {
      this.#chatStore = this.#options.chatStore;
    } else if (hasChatStoreContext()) {
      this.#chatStore = getChatStoreContext() as ChatStore<
        MESSAGE_METADATA,
        DATA_PART_SCHEMAS
      >;
    } else {
      this.#chatStore = defaultChatStore<MESSAGE_METADATA, DATA_PART_SCHEMAS>({
        api: '/api/chat',
        generateId: this.#options.generateId || generateId,
      });
    }

    this.input = this.#options.initialInput ?? '';

    if (!this.#chatStore.hasChat(this.chatId)) {
      const messages = $state([]);
      this.#chatStore.addChat(this.chatId, messages);
    }
  }

  /**
   * Append a user message to the chat list. This triggers the API call to fetch
   * the assistant's response.
   * @param message The message to append
   * @param options Additional options to pass to the API call
   */
  append = async (
    message:
      | UIMessage<MESSAGE_METADATA, InferUIDataParts<DATA_PART_SCHEMAS>>
      | CreateUIMessage<MESSAGE_METADATA, InferUIDataParts<DATA_PART_SCHEMAS>>,
    { headers, body }: ChatRequestOptions = {},
  ) => {
    await this.#chatStore.submitMessage({
      chatId: this.chatId,
      message,
      headers,
      body,
      onError: this.#options.onError,
      onToolCall: this.#options.onToolCall,
      onFinish: this.#options.onFinish,
    });
  };

  /**
   * Reload the last AI chat response for the given chat history. If the last
   * message isn't from the assistant, it will request the API to generate a
   * new response.
   */
  reload = async ({ headers, body }: ChatRequestOptions = {}) => {
    await this.#chatStore.resubmitLastUserMessage({
      chatId: this.chatId,
      headers,
      body,
      onError: this.#options.onError,
      onToolCall: this.#options.onToolCall,
      onFinish: this.#options.onFinish,
    });
  };

  /**
   * Abort the current request immediately, keep the generated tokens if any.
   */
  stop = () => {
    this.#chatStore.stopStream({ chatId: this.chatId });
  };

  /** Form submission handler to automatically reset input and append a user message */
  handleSubmit = async (
    event?: { preventDefault?: () => void },
    options: ChatRequestOptions & { files?: FileList } = {},
  ) => {
    event?.preventDefault?.();

    const fileParts = Array.isArray(options?.files)
      ? options.files
      : await convertFileListToFileUIParts(options?.files);

    if (!this.input && fileParts.length === 0) return;

    const request = this.append(
      {
        id: this.#generateId(),
        role: 'user',
        parts: [...fileParts, { type: 'text', text: this.input }],
      },
      {
        headers: options.headers,
        body: options.body,
      },
    );

    this.input = '';
    await request;
  };

  addToolResult = async ({
    toolCallId,
    result,
  }: {
    toolCallId: string;
    result: unknown;
  }) => {
    await this.#chatStore.addToolResult({
      chatId: this.chatId,
      toolCallId,
      result,
    });
  };
}
