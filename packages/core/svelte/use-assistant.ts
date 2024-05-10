// Import required modules
import { writable, derived, get, Readable, Writable } from 'svelte/store';
import { callCompletionApi } from '../shared/call-completion-api';
import { generateId } from '../shared/generate-id';
import { readDataStream } from '../shared/read-data-stream';
import type { CreateMessage, Message } from '../shared/types';

// Define a type for the assistant status
export type AssistantStatus = 'in_progress' | 'awaiting_message';

// Define the unique identifier counter for completions
let uniqueId = 0;

// Create a storage object to maintain messages by key
const store: Record<string, any> = {};

// Define a store type to maintain the assistant state
export type UseAssistantHelpers = {
  /**
   * Current array of chat messages.
   */
  messages: Readable<Message[]>;

  /**
   * Error object encountered during processing.
   */
  error: Readable<undefined | Error>;

  /**
   * The thread ID being used.
   */
  threadId: Readable<string | undefined>;

  /**
   * The current input field value.
   */
  input: Writable<string>;

  /**
   * Append a user message to the chat list and fetch the assistant's response.
   * @param message The message to append
   * @param requestOptions Additional options to pass to the API call
   */
  append: (
    message: Message | CreateMessage,
    requestOptions?: { data?: Record<string, string> },
  ) => Promise<void>;

  /**
   * Form submission handler that resets the input field and appends a user message.
   */
  submitMessage: (
    e: any,
    requestOptions?: { data?: Record<string, string> },
  ) => Promise<void>;

  /**
   * The current status of the assistant, for loading indication.
   */
  status: Readable<AssistantStatus>;

  /**
   * Update the message store with a new array of messages.
   */
  setMessages: (messages: Message[]) => void;

  /**
   * Stop the current request immediately.
   */
  stop: () => void;
};

export type UseAssistantOptions = {
  /**
   * The API endpoint that accepts a `{ threadId: string | null; message: string; }` object and returns an `AssistantResponse` stream.
   * The threadId refers to an existing thread with messages (or is `null` to create a new thread).
   * The message is the next message that should be appended to the thread and sent to the assistant.
   */
  api: string;

  /**
   * An optional string that represents the ID of an existing thread.
   * If not provided, a new thread will be created.
   */
  threadId?: string;

  /**
   * An optional literal that sets the mode of credentials to be used on the request.
   * Defaults to "same-origin".
   */
  credentials?: RequestCredentials;

  /**
   * An optional object of headers to be passed to the API endpoint.
   */
  headers?: Record<string, string> | Headers;

  /**
   * An optional, additional body object to be passed to the API endpoint.
   */
  body?: object;

  /**
   * An optional callback that will be called when the assistant encounters an error.
   */
  onError?: (error: Error) => void;
};

// Main helper function to handle the assistant functionality
export function useAssistant({
  api,
  threadId: threadIdParam,
  credentials,
  headers,
  body,
  onError,
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
      // Send a request to the specified API
      const result = await fetch(api, {
        method: 'POST',
        credentials,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          ...body,
          threadId: threadIdParam ?? get(threadIdStore) ?? null,
          message: message.content,
          data: requestOptions?.data,
        }),
        signal: abortController.signal,
      });

      if (result.body == null) {
        throw new Error('The response body is empty.');
      }

      // Read the streamed response data
      for await (const { type, value } of readDataStream(
        result.body.getReader(),
      )) {
        switch (type) {
          case 'assistant_message':
            mutateMessages([
              ...get(messages),
              {
                id: value.id,
                role: value.role,
                content: value.content[0].text.value,
              },
            ]);
            break;
          case 'text':
            // Update the last message with the new text content
            mutateMessages(
              get(messages).map((msg, index, array) => {
                if (index === array.length - 1) {
                  return { ...msg, content: msg.content + value };
                }
                return msg;
              }),
            );
            break;
          case 'data_message':
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
          case 'assistant_control_data':
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
          case 'error':
            error.set(new Error(value));
            break;
        }
      }
    } catch (err) {
      if (onError && err instanceof Error) {
        onError(err);
      }
      error.set(err as Error);
    } finally {
      status.set('awaiting_message');
      abortController = null; // Reset the abort controller
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
    e: any,
    requestOptions?: { data?: Record<string, string> },
  ) {
    e.preventDefault();
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
