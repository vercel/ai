import { isAbortError } from '@ai-sdk/provider-utils';
import {
  callChatApi,
  ChatStore,
  convertFileListToFileUIParts,
  defaultChatStore,
  extractMaxToolInvocationStep,
  generateId,
  getToolInvocations,
  isAssistantMessageWithCompletedToolCalls,
  shouldResubmitMessages,
  updateToolCallResult,
  type ChatRequestOptions,
  type CreateUIMessage,
  type OriginalUseChatOptions,
  type UIMessage,
} from 'ai';
import { untrack } from 'svelte';
import {
  getChatContext,
  hasChatContext,
  KeyedChatStore,
} from './chat-context.svelte.js';
import {
  getChatStoreContext,
  hasChatStoreContext,
} from './chat-store-context.svelte.js';

export type ChatOptions<MESSAGE_METADATA = unknown> = Readonly<
  OriginalUseChatOptions<MESSAGE_METADATA>
>;

export type { CreateUIMessage, UIMessage };

export class Chat<MESSAGE_METADATA = unknown> {
  readonly #options: ChatOptions<MESSAGE_METADATA> = {};
  readonly #api = $derived(this.#options.api ?? '/api/chat');
  readonly #generateId = $derived(this.#options.generateId ?? generateId);
  readonly #maxSteps = $derived(this.#options.maxSteps ?? 1);
  readonly #streamProtocol = $derived(
    this.#options.streamProtocol ?? 'ui-message',
  );
  readonly #keyedStore = $state<KeyedChatStore<MESSAGE_METADATA>>()!;
  readonly #chatStore = $state<ChatStore<MESSAGE_METADATA>>()!;

  /**
   * The id of the chat. If not provided through the constructor, a random ID will be generated
   * using the provided `generateId` function, or a built-in function if not provided.
   */
  readonly id = $derived(this.#options.id ?? this.#generateId());
  readonly #store = $derived(this.#keyedStore.get(this.id));

  readonly #messageMetadataSchema = $derived(
    this.#options.messageMetadataSchema,
  );

  #abortController: AbortController | undefined;

  /**
   * Hook status:
   *
   * - `submitted`: The message has been sent to the API and we're awaiting the start of the response stream.
   * - `streaming`: The response is actively streaming in from the API, receiving chunks of data.
   * - `ready`: The full response has been received and processed; a new user message can be submitted.
   * - `error`: An error occurred during the API request, preventing successful completion.
   */
  get status() {
    return this.#chatStore.getStatus(this.id);
  }

  /** The error object of the API request */
  get error() {
    return this.#chatStore.getError(this.id);
  }

  /** The current value of the input. Writable, so it can be bound to form inputs. */
  input = $state<string>()!;

  /**
   * Current messages in the chat.
   *
   * This is writable, which is useful when you want to edit the messages on the client, and then
   * trigger {@link reload} to regenerate the AI response.
   */
  get messages(): UIMessage<MESSAGE_METADATA>[] {
    // temp workaround:
    if (!this.#chatStore.hasChat(this.id)) {
      this.#chatStore.addChat(this.id, []);
    }

    return this.#chatStore.getMessages(this.id);
  }
  set messages(value: UIMessage<MESSAGE_METADATA>[]) {
    untrack(() => (this.#store.messages = value));
  }

  constructor(options: ChatOptions<MESSAGE_METADATA> = {}) {
    this.#options = options; // Assign options early so this.id can be derived

    if (hasChatContext()) {
      this.#keyedStore = getChatContext() as KeyedChatStore<MESSAGE_METADATA>;
    } else {
      this.#keyedStore = new KeyedChatStore<MESSAGE_METADATA>();
    }

    // q: do we want to support chatStore as an option?
    if (hasChatStoreContext()) {
      this.#chatStore = getChatStoreContext() as ChatStore<MESSAGE_METADATA>;
    } else {
      this.#chatStore = defaultChatStore<MESSAGE_METADATA>({
        api: this.#options.api || '/api/chat',
        generateId: this.#options.generateId || generateId,
      });
    }

    this.input = this.#options.initialInput ?? '';

    // Ensure the chat for the *current* this.id exists in #chatStore.
    // This handles the initial ID.
    // Note: this.id is derived, so its value is available here.
    // if (!this.#chatStore.hasChat(this.id)) {
    //   this.#chatStore.addChat(this.id, []);
    // }

    // todo: cleanup, alternative: force use of chatstorecontext?
    const cleanup = $effect.root(() => {
      $effect.pre(() => {
        const currentChatId = this.id;
        if (!this.#chatStore.hasChat(currentChatId)) {
          this.#chatStore.addChat(currentChatId, []);
        }
      });
    });
  }

  /**
   * Append a user message to the chat list. This triggers the API call to fetch
   * the assistant's response.
   * @param message The message to append
   * @param options Additional options to pass to the API call
   */
  append = async (
    message: UIMessage<MESSAGE_METADATA> | CreateUIMessage<MESSAGE_METADATA>,
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
    if (this.messages.length === 0) {
      return;
    }

    const lastMessage = this.messages[this.messages.length - 1];
    await this.#triggerRequest({
      messages:
        lastMessage.role === 'assistant'
          ? this.messages.slice(0, -1)
          : this.messages,
      headers,
      body,
    });
  };

  /**
   * Abort the current request immediately, keep the generated tokens if any.
   */
  stop = () => {
    try {
      this.#abortController?.abort();
    } catch {
      // ignore
    } finally {
      this.#store.status = 'ready';
      this.#abortController = undefined;
    }
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

    const messages = this.messages.concat({
      id: this.#generateId(),
      role: 'user',
      parts: [...fileParts, { type: 'text', text: this.input }],
    });

    const request = this.#triggerRequest({
      messages,
      headers: options.headers,
      body: options.body,
    });

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
    updateToolCallResult({
      messages: this.messages,
      toolCallId,
      toolResult: result,
    });

    // when the request is ongoing, the auto-submit will be triggered after the request is finished
    if (
      this.#store.status === 'submitted' ||
      this.#store.status === 'streaming'
    ) {
      return;
    }

    const lastMessage = this.messages[this.messages.length - 1];
    if (isAssistantMessageWithCompletedToolCalls(lastMessage)) {
      await this.#triggerRequest({ messages: this.messages });
    }
  };

  #triggerRequest = async (
    chatRequest: ChatRequestOptions & {
      messages: UIMessage<MESSAGE_METADATA>[];
    },
  ) => {
    this.#store.status = 'submitted';
    this.#store.error = undefined;

    const messages = chatRequest.messages;
    const messageCount = messages.length;
    const maxStep = extractMaxToolInvocationStep(
      getToolInvocations(messages[messages.length - 1]),
    );

    try {
      const abortController = new AbortController();
      this.#abortController = abortController;

      // Optimistically update messages
      this.messages = messages;

      await callChatApi({
        api: this.#api,
        body: {
          id: this.id,
          messages,
          ...$state.snapshot(this.#options.body),
          ...chatRequest.body,
        },
        streamProtocol: this.#streamProtocol,
        credentials: this.#options.credentials,
        headers: {
          ...this.#options.headers,
          ...chatRequest.headers,
        },
        abortController: () => abortController,
        onUpdate: ({ message }) => {
          this.#store.status = 'streaming';

          const replaceLastMessage =
            message.id === messages[messages.length - 1].id;

          this.messages = messages;
          if (replaceLastMessage) {
            this.messages[this.messages.length - 1] = message;
          } else {
            this.messages.push(message);
          }
        },
        onToolCall: this.#options.onToolCall,
        onFinish: this.#options.onFinish,
        generateId: this.#generateId,
        fetch: this.#options.fetch,
        // callChatApi calls structuredClone on the message
        lastMessage: $state.snapshot(
          this.messages[this.messages.length - 1],
        ) as UIMessage<MESSAGE_METADATA>,
        messageMetadataSchema: this.#messageMetadataSchema,
      });

      this.#abortController = undefined;
      this.#store.status = 'ready';
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      const coalescedError =
        error instanceof Error ? error : new Error(String(error));
      if (this.#options.onError) {
        this.#options.onError(coalescedError);
      }

      this.#store.status = 'error';
      this.#store.error = coalescedError;
    }

    // auto-submit when all tool calls in the last assistant message have results
    // and assistant has not answered yet
    if (
      shouldResubmitMessages({
        originalMaxToolInvocationStep: maxStep,
        originalMessageCount: messageCount,
        maxSteps: this.#maxSteps,
        messages: this.messages,
      })
    ) {
      await this.#triggerRequest({ messages: this.messages });
    }
  };
}
