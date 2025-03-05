import { isAbortError } from "@ai-sdk/provider-utils";
import type {
  AssistantStatus,
  CreateMessage,
  Message,
  UseAssistantOptions,
} from "@ai-sdk/ui-utils";
import { generateId, processAssistantStream } from "@ai-sdk/ui-utils";
import { Readable, Writable, get, writable } from "svelte/store";

export type UseAssistantHelpers = {
  /**
   * Append a user message to the chat list. This triggers the API call to fetch
   * the assistant's response.
   * @param message The message to append
   * @param requestOptions Additional options to pass to the API call
   */
  append: (
    message: Message | CreateMessage,
    requestOptions?: {
      data?: Record<string, string>;
    },
  ) => Promise<void>;

  /**
   * Abort the current request immediately, keep the generated tokens if any.
   */
  stop: () => void;

  /**
   * Form submission handler that automatically resets the input field and appends a user message.
   */
  submitMessage: (
    event?: Event & {
      currentTarget: EventTarget & HTMLFormElement;
    },
    requestOptions?: {
      data?: Record<string, string>;
    },
  ) => Promise<void>;
};

export class Assistant {
  #threadId = $state<string>()!;
  #status = $state<AssistantStatus>("awaiting_message");
  #error = $state<Error | undefined>(undefined);
  #abortController = $state<AbortController | null>(null);

  api = $state<UseAssistantOptions["api"]>()!;
  credentials = $state<UseAssistantOptions["credentials"]>();
  headers = $state<UseAssistantOptions["headers"]>();
  body = $state<UseAssistantOptions["body"]>();
  fetch = $state<NonNullable<UseAssistantOptions["fetch"]>>(fetch);
  input = $state<string>("");
  messages = $state<Message[]>([]);

  get threadId() {
    return this.#threadId;
  }

  set threadId(value: string | undefined) {
    this.#threadId = value ?? Assistant.#newThreadId();
    this.messages = [];
  }

  get status(): AssistantStatus {
    return this.#status;
  }

  get error(): Error | undefined {
    return this.#error;
  }

  constructor({ api, threadId, fetch }: UseAssistantOptions) {
    this.#threadId = threadId ?? Assistant.#newThreadId();
    this.fetch = fetch ?? this.fetch;
    this.api = api;
  }

  append = async (
    message: Message | CreateMessage,
    requestOptions?: { data?: Record<string, string> },
  ) => {
    const classInstance = this;
    this.#status = "in_progress";
    this.#abortController = new AbortController();
    this.messages.push({ ...message, id: message.id ?? generateId() });
    this.input = "";

    try {
      const response = await this.fetch(this.api, {
        method: "POST",
        credentials: this.credentials,
        signal: this.#abortController.signal,
        headers: { "Content-Type": "application/json", ...this.headers },
        body: JSON.stringify({
          ...this.body,
          threadId: this.threadId,
          message: message.content,
          data: requestOptions?.data,
        }),
      });

      if (!response.ok) {
        throw new Error(
          (await response.text()) ?? "Failed to fetch the assistant response.",
        );
      }

      if (response.body == null) {
        throw new Error("The response body is empty.");
      }

      await processAssistantStream({
        stream: response.body,
        onAssistantMessagePart(value) {
          classInstance.messages.push({
            id: value.id,
            role: value.role,
            content: value.content[0].text.value,
            parts: [],
          });
        },
        onTextPart(value) {
          // in a technical sense this is unsafe, but it'd be a bug in the assistant utils package
          classInstance.messages[classInstance.messages.length - 1].content +=
            value;
        },
        onAssistantControlDataPart(value) {
          classInstance.#threadId = value.threadId;
          classInstance.messages[classInstance.messages.length - 1].id =
            value.messageId;
        },
        onDataMessagePart(value) {
          classInstance.messages.push({
            id: value.id ?? generateId(),
            role: "data",
            content: "",
            data: value.data,
            parts: [],
          });
        },
        onErrorPart(value) {
          classInstance.#error = new Error(value);
        },
      });
    } catch (err) {
      // Ignore abort errors as they are expected when the user cancels the request:
      if (isAbortError(error) && abortController?.signal?.aborted) {
        abortController = null;
        return;
      }

      if (onError && err instanceof Error) {
        onError(err);
      }

      error.set(err as Error);
    } finally {
      abortController = null;
      status.set("awaiting_message");
    }
  };

  static #newThreadId() {
    return `completion-${generateId()}`;
  }
}

let uniqueId = 0;

const store: Record<string, any> = {};

export function useAssistant({
  api,
  threadId: threadIdParam,
  credentials,
  headers,
  body,
  onError,
  fetch = fetch,
}: UseAssistantOptions): UseAssistantHelpers {
  // Generate a unique thread ID
  const threadIdStore = writable<string | undefined>(threadIdParam);

  // Initialize message, input, status, and error stores
  const key = `${api}|${threadIdParam ?? `completion-${uniqueId++}`}`;
  const messages = writable<Message[]>(store[key] || []);
  const input = writable("");
  const status = writable<AssistantStatus>("awaiting_message");
  const error = writable<undefined | Error>(undefined);

  // To manage aborting the current fetch request
  let abortController: AbortController | null = null;

  // Update the message store
  const mutateMessages = (newMessages: Message[]) => {
    store[key] = newMessages;
    messages.set(newMessages);
  };

  // Function to handle API calls and state management
  async function append(
    message: Message | CreateMessage,
    requestOptions?: { data?: Record<string, string> },
  ) {
    status.set("in_progress");
    abortController = new AbortController(); // Initialize a new AbortController

    // Add the new message to the existing array
    mutateMessages([
      ...get(messages),
      { ...message, id: message.id ?? generateId() },
    ]);

    input.set("");

    try {
      const response = await fetch(api, {
        method: "POST",
        credentials,
        signal: abortController.signal,
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          ...body,
          // always use user-provided threadId when available:
          threadId: threadIdParam ?? get(threadIdStore) ?? null,
          message: message.content,

          // optional request data:
          data: requestOptions?.data,
        }),
      });

      if (!response.ok) {
        throw new Error(
          (await response.text()) ?? "Failed to fetch the assistant response.",
        );
      }

      if (response.body == null) {
        throw new Error("The response body is empty.");
      }

      await processAssistantStream({
        stream: response.body,
        onAssistantMessagePart(value) {
          mutateMessages([
            ...get(messages),
            {
              id: value.id,
              role: value.role,
              content: value.content[0].text.value,
              parts: [],
            },
          ]);
        },
        onTextPart(value) {
          // text delta - add to last message:
          mutateMessages(
            get(messages).map((msg, index, array) => {
              if (index === array.length - 1) {
                return { ...msg, content: msg.content + value };
              }
              return msg;
            }),
          );
        },
        onAssistantControlDataPart(value) {
          threadIdStore.set(value.threadId);

          mutateMessages(
            get(messages).map((msg, index, array) => {
              if (index === array.length - 1) {
                return { ...msg, id: value.messageId };
              }
              return msg;
            }),
          );
        },
        onDataMessagePart(value) {
          mutateMessages([
            ...get(messages),
            {
              id: value.id ?? generateId(),
              role: "data",
              content: "",
              data: value.data,
              parts: [],
            },
          ]);
        },
        onErrorPart(value) {
          error.set(new Error(value));
        },
      });
    } catch (err) {
      // Ignore abort errors as they are expected when the user cancels the request:
      if (isAbortError(error) && abortController?.signal?.aborted) {
        abortController = null;
        return;
      }

      if (onError && err instanceof Error) {
        onError(err);
      }

      error.set(err as Error);
    } finally {
      abortController = null;
      status.set("awaiting_message");
    }
  }

  function setMessages(messages: Message[]) {
    mutateMessages(messages);
  }

  function stop() {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
  }

  // Function to handle form submission
  async function submitMessage(
    event?: { preventDefault?: () => void },
    requestOptions?: { data?: Record<string, string> },
  ) {
    event?.preventDefault?.();
    const inputValue = get(input);
    if (!inputValue) return;

    await append(
      { role: "user", content: inputValue, parts: [] },
      requestOptions,
    );
  }

  return {
    messages,
    error,
    threadId: threadIdStore,
    input,
    append,
    submitMessage,
    status,
    setMessages,
    stop,
  };
}
