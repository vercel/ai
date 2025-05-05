import { isAbortError } from '@ai-sdk/provider-utils';
import {
  callChatApi,
  convertFileListToFileUIParts,
  extractMaxToolInvocationStep,
  generateId,
  getToolInvocations,
  isAssistantMessageWithCompletedToolCalls,
  shouldResubmitMessages,
  updateToolCallResult,
  type ChatRequest,
  type ChatRequestOptions,
  type CreateUIMessage,
  type JSONValue,
  type UIMessage,
  type UseChatOptions,
} from 'ai';
import { untrack } from 'svelte';
import {
  KeyedChatStore,
  getChatContext,
  hasChatContext,
} from './chat-context.svelte.js';

export type ChatOptions = Readonly<
  UseChatOptions & {
    '~internal'?: {
      currentDate?: () => Date;
    };
  }
>;

export type { CreateUIMessage, UIMessage };

export class Chat {
  readonly #options: ChatOptions = {};
  readonly #api = $derived(this.#options.api ?? '/api/chat');
  readonly #generateId = $derived(this.#options.generateId ?? generateId);
  readonly #maxSteps = $derived(this.#options.maxSteps ?? 1);
  readonly #streamProtocol = $derived(this.#options.streamProtocol ?? 'data');
  readonly #keyedStore = $state<KeyedChatStore>()!;
  /**
   * The id of the chat. If not provided through the constructor, a random ID will be generated
   * using the provided `generateId` function, or a built-in function if not provided.
   */
  readonly id = $derived(this.#options.id ?? this.#generateId());
  readonly #store = $derived(this.#keyedStore.get(this.id));
  #abortController: AbortController | undefined;

  /**
   * Additional data added on the server via StreamData.
   *
   * This is writable, so you can use it to transform or clear the chat data.
   */
  get data() {
    return this.#store.data;
  }
  set data(value: JSONValue[] | undefined) {
    this.#store.data = value;
  }

  /**
   * Hook status:
   *
   * - `submitted`: The message has been sent to the API and we're awaiting the start of the response stream.
   * - `streaming`: The response is actively streaming in from the API, receiving chunks of data.
   * - `ready`: The full response has been received and processed; a new user message can be submitted.
   * - `error`: An error occurred during the API request, preventing successful completion.
   */
  get status() {
    return this.#store.status;
  }

  /** The error object of the API request */
  get error() {
    return this.#store.error;
  }

  /** The current value of the input. Writable, so it can be bound to form inputs. */
  input = $state<string>()!;

  /**
   * Current messages in the chat.
   *
   * This is writable, which is useful when you want to edit the messages on the client, and then
   * trigger {@link reload} to regenerate the AI response.
   */
  get messages(): UIMessage[] {
    return this.#store.messages;
  }
  set messages(value: UIMessage[]) {
    untrack(() => (this.#store.messages = value));
  }

  private currentDate = $derived(
    this.#options['~internal']?.currentDate ?? (() => new Date()),
  );

  constructor(options: ChatOptions = {}) {
    if (hasChatContext()) {
      this.#keyedStore = getChatContext();
    } else {
      this.#keyedStore = new KeyedChatStore();
    }

    this.#options = options;
    this.messages = options.initialMessages ?? [];
    this.input = options.initialInput ?? '';
  }

  /**
   * Append a user message to the chat list. This triggers the API call to fetch
   * the assistant's response.
   * @param message The message to append
   * @param options Additional options to pass to the API call
   */
  append = async (
    message: UIMessage | CreateUIMessage,
    { data, headers, body }: ChatRequestOptions = {},
  ) => {
    const messages = this.messages.concat({
      ...message,
      id: message.id ?? this.#generateId(),
      createdAt: message.createdAt ?? this.currentDate(),
      parts: message.parts,
    });

    return this.#triggerRequest({ messages, headers, body, data });
  };

  /**
   * Reload the last AI chat response for the given chat history. If the last
   * message isn't from the assistant, it will request the API to generate a
   * new response.
   */
  reload = async ({ data, headers, body }: ChatRequestOptions = {}) => {
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
      data,
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
    if (!this.input && !options.allowEmptySubmit) return;

    const fileParts = Array.isArray(options?.files)
      ? options.files
      : await convertFileListToFileUIParts(options?.files);

    const messages = this.messages.concat({
      id: this.#generateId(),
      createdAt: this.currentDate(),
      role: 'user',
      parts: [...fileParts, { type: 'text', text: this.input }],
    });

    const chatRequest: ChatRequest = {
      messages,
      headers: options.headers,
      body: options.body,
      data: options.data,
    };

    const request = this.#triggerRequest(chatRequest);
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

  #triggerRequest = async (chatRequest: ChatRequest) => {
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

      const existingData = this.data ?? [];
      await callChatApi({
        api: this.#api,
        body: {
          id: this.id,
          messages,
          data: chatRequest.data,
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
        onResponse: this.#options.onResponse,
        onUpdate: ({ message, data, replaceLastMessage }) => {
          this.#store.status = 'streaming';

          this.messages = messages;
          if (replaceLastMessage) {
            this.messages[this.messages.length - 1] = message;
          } else {
            this.messages.push(message);
          }

          if (data?.length) {
            this.data = existingData;
            this.data.push(...data);
          }
        },
        onToolCall: this.#options.onToolCall,
        onFinish: this.#options.onFinish,
        generateId: this.#generateId,
        getCurrentDate: this.currentDate,
        fetch: this.#options.fetch,
        // callChatApi calls structuredClone on the message
        lastMessage: $state.snapshot(this.messages[this.messages.length - 1]),
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
