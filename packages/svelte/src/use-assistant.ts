import { isAbortError } from '@ai-sdk/provider-utils';
import type {
  AssistantStatus,
  CreateMessage,
  Message,
  UseAssistantOptions,
} from '@ai-sdk/ui-utils';
import { generateId, readDataStream } from '@ai-sdk/ui-utils';
import { Readable, Writable, get, writable } from 'svelte/store';

// use function to allow for mocking in tests:
const getOriginalFetch = () => fetch;

let uniqueId = 0;

const store: Record<string, any> = {};

export type UseAssistantHelpers = {
  /**
   * The current array of chat messages.
   */
  messages: Readable<Message[]>;

  /**
   * Update the message store with a new array of messages.
   */
  setMessages: (messages: Message[]) => void;

  /**
   * The current thread ID.
   */
  threadId: Readable<string | undefined>;

  /**
   * The current value of the input field.
   */
  input: Writable<string>;

  /**
   * Append a user message to the chat list. This triggers the API call to fetch
   * the assistant's response.
   * @param message The message to append
   * @param requestOptions Additional options to pass to the API call
   */
  append: (
    message: Message | CreateMessage,
    requestOptions?: { data?: Record<string, string> },
  ) => Promise<void>;

  /**
Abort the current request immediately, keep the generated tokens if any.
   */
  stop: () => void;

  /**
   * Form submission handler that automatically resets the input field and appends a user message.
   */
  submitMessage: (
    event?: { preventDefault?: () => void },
    requestOptions?: { data?: Record<string, string> },
  ) => Promise<void>;

  /**
   * The current status of the assistant. This can be used to show a loading indicator.
   */
  status: Readable<AssistantStatus>;

  /**
   * The error thrown during the assistant message processing, if any.
   */
  error: Readable<undefined | Error>;
};

export function useAssistant({
  api,
  threadId: threadIdParam,
  credentials,
  headers,
  body,
  onError,
  fetch,
}: UseAssistantOptions): UseAssistantHelpers {
  // Generate a unique thread ID
  const threadIdStore = writable<string | undefined>(threadIdParam);

  // Initialize message, input, status, and error stores
  const key = `${api}|${threadIdParam ?? `completion-${uniqueId++}`}`;
  const messages = writable<Message[]>(store[key] || []);
  const input = writable('');
  const status = writable<AssistantStatus>('awaiting_message');
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
    status.set('in_progress');
    abortController = new AbortController(); // Initialize a new AbortController

    // Add the new message to the existing array
    mutateMessages([
      ...get(messages),
      { ...message, id: message.id ?? generateId() },
    ]);

    input.set('');

    try {
      const actualFetch = fetch ?? getOriginalFetch();
      const response = await actualFetch(api, {
        method: 'POST',
        credentials,
        signal: abortController.signal,
        headers: { 'Content-Type': 'application/json', ...headers },
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
          (await response.text()) ?? 'Failed to fetch the assistant response.',
        );
      }

      if (response.body == null) {
        throw new Error('The response body is empty.');
      }

      // Read the streamed response data
      for await (const { type, value } of readDataStream(
        response.body.getReader(),
      )) {
        switch (type) {
          case 'assistant_message': {
            mutateMessages([
              ...get(messages),
              {
                id: value.id,
                role: value.role,
                content: value.content[0].text.value,
              },
            ]);
            break;
          }

          case 'text': {
            // text delta - add to last message:
            mutateMessages(
              get(messages).map((msg, index, array) => {
                if (index === array.length - 1) {
                  return { ...msg, content: msg.content + value };
                }
                return msg;
              }),
            );
            break;
          }

          case 'data_message': {
            mutateMessages([
              ...get(messages),
              {
                id: value.id ?? generateId(),
                role: 'data',
                content: '',
                data: value.data,
              },
            ]);
            break;
          }

          case 'assistant_control_data': {
            threadIdStore.set(value.threadId);

            mutateMessages(
              get(messages).map((msg, index, array) => {
                if (index === array.length - 1) {
                  return { ...msg, id: value.messageId };
                }
                return msg;
              }),
            );

            break;
          }

          case 'error': {
            error.set(new Error(value));
            break;
          }
        }
      }
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
      status.set('awaiting_message');
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

    await append({ role: 'user', content: inputValue }, requestOptions);
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
