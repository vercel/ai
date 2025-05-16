import {
  ChatStore,
  convertFileListToFileUIParts,
  defaultChatStore,
  generateId,
  type ChatRequestOptions,
  type ChatStatus,
  type CreateUIMessage,
  type OriginalUseChatOptions,
  type UIDataTypes,
  type UIMessage,
} from 'ai';
import {
  getChatStoreContext,
  hasChatStoreContext,
} from './chat-store-context.svelte.js';

export type ChatOptions<MESSAGE_METADATA = unknown> = Readonly<
  OriginalUseChatOptions<MESSAGE_METADATA>
>;

export type { CreateUIMessage, UIMessage };

export class Chat<
  MESSAGE_METADATA = unknown,
  DATA_TYPES extends UIDataTypes = UIDataTypes,
> {
  readonly #options: ChatOptions<MESSAGE_METADATA> = {};
  readonly #generateId = $derived(this.#options.generateId ?? generateId);
  readonly #chatStore = $state<ChatStore<MESSAGE_METADATA, DATA_TYPES>>()!;

  /**
   * The id of the chat. If not provided through the constructor, a random ID will be generated
   * using the provided `generateId` function, or a built-in function if not provided.
   */
  readonly id = $derived(this.#options.id ?? this.#generateId());

  #messages = $state<UIMessage<MESSAGE_METADATA, DATA_TYPES>[]>([]);
  /**
   * Hook status:
   *
   * - `submitted`: The message has been sent to the API and we're awaiting the start of the response stream.
   * - `streaming`: The response is actively streaming in from the API, receiving chunks of data.
   * - `ready`: The full response has been received and processed; a new user message can be submitted.
   * - `error`: An error occurred during the API request, preventing successful completion.
   */
  #status = $state<ChatStatus>('ready');
  /** The error object of the API request */
  #error = $state<Error | undefined>(undefined);

  #cleanup: (() => void) | undefined;
  #unsubscribeFromStore: (() => void) | undefined;

  /** The current value of the input. Writable, so it can be bound to form inputs. */
  input = $state<string>()!;

  /**
   * Current messages in the chat.
   *
   * This is writable, which is useful when you want to edit the messages on the client, and then
   * trigger {@link reload} to regenerate the AI response.
   */
  get messages(): UIMessage<MESSAGE_METADATA, DATA_TYPES>[] {
    return this.#messages;
  }
  set messages(value: UIMessage<MESSAGE_METADATA, DATA_TYPES>[]) {
    this.#chatStore.setMessages({ id: this.id, messages: value });
  }

  get status(): ChatStatus {
    return this.#status;
  }
  set status(value: ChatStatus) {
    this.#chatStore.setStatus({ id: this.id, status: value });
  }

  get error(): Error | undefined {
    return this.#error;
  }
  set error(value: Error | undefined) {
    this.#chatStore.setStatus({ id: this.id, status: 'error', error: value });
  }

  constructor(options: ChatOptions<MESSAGE_METADATA> = {}) {
    this.#options = options;

    if (hasChatStoreContext()) {
      this.#chatStore = getChatStoreContext() as ChatStore<
        MESSAGE_METADATA,
        DATA_TYPES
      >;
    } else {
      this.#chatStore = defaultChatStore<MESSAGE_METADATA, DATA_TYPES>({
        api: this.#options.api || '/api/chat',
        generateId: this.#options.generateId || generateId,
        maxSteps: this.#options.maxSteps,
        streamProtocol: this.#options.streamProtocol,
      });
    }

    this.input = this.#options.initialInput ?? '';

    this.#unsubscribeFromStore = this.#chatStore.subscribe({
      onChatChanged: event => {
        if (
          event.chatId === this.id &&
          event.type === 'chat-messages-changed'
        ) {
          this.#syncMessages();
        }

        if (event.chatId === this.id && event.type === 'chat-status-changed') {
          this.#syncStatus();
        }
      },
    });

    this.#cleanup = $effect.root(() => {
      $effect.pre(() => {
        const currentChatId = this.id;

        if (!this.#chatStore.hasChat(currentChatId)) {
          this.#chatStore.addChat(currentChatId, []);
        }

        this.#syncMessages();
      });
    });
  }

  #syncMessages = () => {
    if (this.#chatStore.hasChat(this.id)) {
      this.#messages = [...this.#chatStore.getMessages(this.id)];
    } else {
      this.#chatStore.addChat(this.id, []);
      this.#messages = [];
    }
  };

  #syncStatus = () => {
    if (this.#chatStore.hasChat(this.id)) {
      this.#status = this.#chatStore.getStatus(this.id);
      this.#error = this.#chatStore.getError(this.id);
    } else {
      this.#status = 'ready';
      this.#error = undefined;
    }
  };

  /**
   * Append a user message to the chat list. This triggers the API call to fetch
   * the assistant's response.
   * @param message The message to append
   * @param options Additional options to pass to the API call
   */
  append = async (
    message:
      | UIMessage<MESSAGE_METADATA, DATA_TYPES>
      | CreateUIMessage<MESSAGE_METADATA, DATA_TYPES>,
    { headers, body }: ChatRequestOptions = {},
  ) => {
    await this.#chatStore.submitMessage({
      chatId: this.id,
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
      chatId: this.id,
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
    this.#chatStore.stopStream({ chatId: this.id });
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
      chatId: this.id,
      toolCallId,
      result,
    });
  };

  destroy() {
    this.#cleanup?.();
    this.#unsubscribeFromStore?.();
  }
}
