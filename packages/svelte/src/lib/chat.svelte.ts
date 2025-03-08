import {
  fillMessageParts,
  generateId,
  type UIMessage,
  type UseChatOptions,
  type JSONValue,
  type ChatRequest,
  extractMaxToolInvocationStep,
  callChatApi,
  shouldResubmitMessages,
  type Message,
  type CreateMessage,
  type ChatRequestOptions,
  prepareAttachmentsForRequest,
  getMessageParts,
  updateToolCallResult,
  isAssistantMessageWithCompletedToolCalls,
} from "@ai-sdk/ui-utils";
import { isAbortError } from "@ai-sdk/provider-utils";
import { SvelteMap } from "svelte/reactivity";

export type ChatOptions = Readonly<
  Omit<UseChatOptions, "keepLastMessageOnError"> & {
    /**
     * Maximum number of sequential LLM calls (steps), e.g. when you use tool calls.
     * Must be at least 1.
     * A maximum number is required to prevent infinite loops in the case of misconfigured tools.
     * By default, it's set to 1, which means that only a single LLM call is made.
     * @default 1
     */
    maxSteps?: number;
  }
>;

export type { CreateMessage, Message, UIMessage };

export class Chat {
  readonly #options: ChatOptions = {};
  readonly #api = $derived(this.#options.api ?? "/api/chat");
  readonly #generateId = $derived(this.#options.generateId ?? generateId);
  readonly #id = $derived(this.#options.id ?? this.#generateId());
  readonly #maxSteps = $derived(this.#options.maxSteps ?? 1);
  readonly #streamProtocol = $derived(this.#options.streamProtocol ?? "data");
  #error = $state<Error>();
  #status = $state<"submitted" | "streaming" | "ready" | "error">("ready");
  #abortController: AbortController | undefined;
  #messages = new SvelteMap<string, UIMessage[]>();

  /**
   * The id of the chat. If not provided through the constructor, a random ID will be generated
   * using the provided `generateId` function, or a built-in function if not provided.
   */
  get id() {
    return this.#id;
  }

  /**
   * Additional data added on the server via StreamData.
   *
   * This is writable, so you can use it to transform or clear the chat data.
   */
  data = $state<JSONValue[]>();

  /**
   * Hook status:
   *
   * - `submitted`: The message has been sent to the API and we're awaiting the start of the response stream.
   * - `streaming`: The response is actively streaming in from the API, receiving chunks of data.
   * - `ready`: The full response has been received and processed; a new user message can be submitted.
   * - `error`: An error occurred during the API request, preventing successful completion.
   */
  get status() {
    return this.#status;
  }

  /** The error object of the API request */
  get error() {
    return this.#error;
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
    return this.#messages.get(this.#id) ?? [];
  }
  set messages(value: Message[]) {
    this.#messages.set(this.#id, fillMessageParts(value));
  }

  constructor(options: ChatOptions = {}) {
    this.#options = options;
    this.messages = options.initialMessages ?? [];
    this.input = options.initialInput ?? "";
  }

  /**
   * Append a user message to the chat list. This triggers the API call to fetch
   * the assistant's response.
   * @param message The message to append
   * @param options Additional options to pass to the API call
   */
  append = async (
    message: Message | CreateMessage,
    { data, headers, body, experimental_attachments }: ChatRequestOptions = {},
  ) => {
    const attachmentsForRequest = await prepareAttachmentsForRequest(
      experimental_attachments,
    );

    const messages = this.messages.concat({
      ...message,
      id: message.id ?? generateId(),
      createdAt: message.createdAt ?? new Date(),
      experimental_attachments:
        attachmentsForRequest.length > 0 ? attachmentsForRequest : undefined,
      parts: getMessageParts(message),
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
        lastMessage.role === "assistant"
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
      this.#status = "ready";
      this.#abortController = undefined;
    }
  };

  /** Form submission handler to automatically reset input and append a user message */
  handleSubmit = async (
    event?: { preventDefault?: () => void },
    options: ChatRequestOptions = {},
  ) => {
    event?.preventDefault?.();
    if (!this.input && !options.allowEmptySubmit) return;

    const attachmentsForRequest = await prepareAttachmentsForRequest(
      options.experimental_attachments,
    );

    const messages = this.messages.concat({
      id: generateId(),
      createdAt: new Date(),
      role: "user",
      content: this.input,
      experimental_attachments:
        attachmentsForRequest.length > 0 ? attachmentsForRequest : undefined,
      parts: [{ type: "text", text: this.input }],
    });

    const chatRequest: ChatRequest = {
      messages,
      headers: options.headers,
      body: options.body,
      data: options.data,
    };

    await this.#triggerRequest(chatRequest);
    this.input = "";
  };

  addToolResult = ({
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

    const lastMessage = this.messages[this.messages.length - 1];
    if (isAssistantMessageWithCompletedToolCalls(lastMessage)) {
      this.#triggerRequest({ messages: this.messages });
    }
  };

  #triggerRequest = async (chatRequest: ChatRequest) => {
    this.#status = "submitted";
    this.#error = undefined;

    const messages = fillMessageParts(chatRequest.messages);
    const messageCount = messages.length;
    const maxStep = extractMaxToolInvocationStep(
      messages[messages.length - 1]?.toolInvocations,
    );

    try {
      this.#abortController = new AbortController();

      // Optimistically update messages
      this.messages = messages;

      const constructedMessagesPayload = this.#options.sendExtraMessageFields
        ? messages
        : messages.map(
            ({
              role,
              content,
              experimental_attachments,
              data,
              annotations,
              toolInvocations,
              parts,
            }) => ({
              role,
              content,
              ...(experimental_attachments !== undefined && {
                experimental_attachments,
              }),
              ...(data !== undefined && { data }),
              ...(annotations !== undefined && { annotations }),
              ...(toolInvocations !== undefined && { toolInvocations }),
              ...(parts !== undefined && { parts }),
            }),
          );

      const existingData = this.data ?? [];
      await callChatApi({
        api: this.#api,
        body: {
          id: this.id,
          messages: constructedMessagesPayload,
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
        abortController: () => this.#abortController ?? null,
        restoreMessagesOnFailure: () => {},
        onResponse: this.#options.onResponse,
        onUpdate: ({ message, data, replaceLastMessage }) => {
          this.#status = "streaming";

          this.messages = [
            ...(replaceLastMessage ? messages.slice(0, -1) : messages),
            message,
          ];

          if (data?.length) {
            this.data = [...existingData, ...data];
          }
        },
        onToolCall: this.#options.onToolCall,
        onFinish: this.#options.onFinish,
        generateId: this.#generateId,
        fetch: this.#options.fetch,
        lastMessage: messages[messages.length - 1],
      });

      this.#abortController = undefined;
      this.#status = "ready";
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      const coalescedError =
        error instanceof Error ? error : new Error(String(error));
      if (this.#options.onError) {
        this.#options.onError(coalescedError);
      }

      this.#status = "error";
      this.#error = coalescedError;
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
      await this.#triggerRequest({ messages });
    }
  };
}
