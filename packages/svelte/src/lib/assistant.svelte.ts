import { isAbortError } from "@ai-sdk/provider-utils";
import type {
  AssistantStatus,
  CreateMessage,
  Message,
  UseAssistantOptions,
} from "@ai-sdk/ui-utils";
import { generateId, processAssistantStream } from "@ai-sdk/ui-utils";
import { ThreadMessageManager } from "./thread-message-manager.svelte.js";

export class Assistant extends ThreadMessageManager {
  readonly #options = $state<Readonly<UseAssistantOptions>>()!;
  #status = $state<AssistantStatus>("awaiting_message");
  #error = $state<Error | undefined>(undefined);
  #abortController = $state<AbortController | null>(null);
  // this is derived so that if `#options.fetch` becomes `undefined` we still have a `fetch` implementation
  readonly #fetch = $derived<NonNullable<UseAssistantOptions["fetch"]>>(
    this.#options?.fetch ?? fetch,
  );

  /**
   * The current value of the input field.
   */
  input = $state<string>("");

  /**
   * The current status of the assistant. This can be used to show a loading indicator.
   */
  get status(): AssistantStatus {
    return this.#status;
  }

  /**
   * The error thrown during the assistant message processing, if any.
   */
  get error(): Error | undefined {
    return this.#error;
  }

  constructor(options: Readonly<UseAssistantOptions>) {
    super(options);
    this.#options = options;
  }

  /**
   * Append a user message to the chat list. This triggers the API call to fetch
   * the assistant's response.
   * @param message The message to append
   * @param requestOptions Additional options to pass to the API call
   */
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
      const response = await this.#fetch(this.#options.api, {
        method: "POST",
        credentials: this.#options.credentials,
        signal: this.#abortController.signal,
        headers: {
          "Content-Type": "application/json",
          ...($state.snapshot(
            this.#options.headers,
          ) as UseAssistantOptions["headers"]),
        },
        body: JSON.stringify({
          ...$state.snapshot(this.#options.body),
          threadId: this.threadId ?? null,
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
          classInstance.threadId = value.threadId;
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
    } catch (error) {
      console.log(error);
      // Ignore abort errors as they are expected when the user cancels the request:
      if (isAbortError(error) && this.#abortController?.signal?.aborted) {
        this.#abortController = null;
        return;
      }

      if (this.#options.onError && error instanceof Error) {
        this.#options.onError(error);
      }

      this.#error = error as Error;
    } finally {
      this.#abortController = null;
      this.#status = "awaiting_message";
    }
  };

  /**
   * Abort the current request immediately, keep the generated tokens if any.
   */
  stop = () => {
    if (this.#abortController) {
      this.#abortController.abort();
      this.#abortController = null;
    }
  };

  /**
   * Form submission handler that automatically resets the input field and appends a user message.
   */
  submitMessage = async (
    event?: { preventDefault?: () => void },
    requestOptions?: { data?: Record<string, string> },
  ): Promise<void> => {
    event?.preventDefault?.();
    if (!this.input) return;

    await this.append(
      { role: "user", content: this.input, parts: [] },
      requestOptions,
    );
  };
}
