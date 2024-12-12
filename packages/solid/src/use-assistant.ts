import { isAbortError } from '@ai-sdk/provider-utils';
import {
  AssistantStatus,
  CreateMessage,
  Message,
  UseAssistantOptions,
  generateId,
  processAssistantStream,
} from '@ai-sdk/ui-utils';
import { Accessor, createMemo, createSignal, JSX, Setter } from 'solid-js';
import { convertToAccessorOptions } from './utils/convert-to-accessor-options';
import {
  createStore,
  SetStoreFunction,
  Store,
  StoreSetter,
} from 'solid-js/store';

// use function to allow for mocking in tests:
const getOriginalFetch = () => fetch;

export type UseAssistantHelpers = {
  /**
   * The current array of chat messages.
   */
  messages: Store<Message[]>;

  /**
   * Update the message store with a new array of messages.
   */
  setMessages: SetStoreFunction<Message[]>;

  /**
   * The current thread ID.
   */
  threadId: Accessor<string | undefined>;

  /**
   * Set the current thread ID. Specifying a thread ID will switch to that thread, if it exists. If set to 'undefined', a new thread will be created. For both cases, `threadId` will be updated with the new value and `messages` will be cleared.
   */
  setThreadId: (threadId: string | undefined) => void;

  /**
   * The current value of the input field.
   */
  input: Accessor<string>;

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
Abort the current request immediately, keep the generated tokens if any.
   */
  stop: () => void;

  /**
   * setState-powered method to update the input value.
   */
  setInput: Setter<string>;

  /**
   * Handler for the `onChange` event of the input field to control the input's value.
   */
  handleInputChange: JSX.ChangeEventHandlerUnion<
    HTMLInputElement | HTMLTextAreaElement,
    Event
  >;

  /**
   * Form submission handler that automatically resets the input field and appends a user message.
   */
  submitMessage: (
    event?: SubmitEvent,
    requestOptions?: {
      data?: Record<string, string>;
    },
  ) => Promise<void>;

  /**
   * The current status of the assistant. This can be used to show a loading indicator.
   */
  status: Accessor<AssistantStatus>;

  /**
   * The error thrown during the assistant message processing, if any.
   */
  error: Accessor<undefined | Error>;
};

export function useAssistant(
  rawUseAssistantOptions: UseAssistantOptions | Accessor<UseAssistantOptions>,
): UseAssistantHelpers {
  const useAssistantOptions = createMemo(() =>
    convertToAccessorOptions(rawUseAssistantOptions),
  );

  const [messages, setMessages] = createStore<Message[]>([]);
  const [input, setInput] = createSignal('');
  const [currentThreadId, setCurrentThreadId] = createSignal<string>();
  const [status, setStatus] = createSignal<AssistantStatus>('awaiting_message');
  const [error, setError] = createSignal<Error>();

  const handleInputChange: JSX.ChangeEventHandlerUnion<
    HTMLInputElement | HTMLTextAreaElement,
    Event
  > = event => {
    setInput(event.target.value);
  };

  // Abort controller to cancel the current API call.
  let abortControllerRef: AbortController | null = null;

  const stop = () => {
    if (abortControllerRef) {
      abortControllerRef?.abort();
      abortControllerRef = null;
    }
  };

  const append = async (
    message: Message | CreateMessage,
    requestOptions?: {
      data?: Record<string, string>;
    },
  ) => {
    setStatus('in_progress');

    setMessages(messages => [
      ...messages,
      {
        ...message,
        id: message.id ?? generateId(),
      },
    ]);

    setInput('');

    const abortController = new AbortController();

    try {
      abortControllerRef = abortController;

      const actualFetch = fetch ?? getOriginalFetch();
      const response = await actualFetch(useAssistantOptions().api(), {
        method: 'POST',
        credentials: useAssistantOptions().credentials?.(),
        signal: abortController.signal,
        headers: {
          'Content-Type': 'application/json',
          ...useAssistantOptions().headers?.(),
        },
        body: JSON.stringify({
          ...useAssistantOptions().body?.(),
          // always use user-provided threadId when available:
          threadId: useAssistantOptions().threadId?.() ?? currentThreadId(),
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

      await processAssistantStream({
        stream: response.body,
        onAssistantMessagePart(value) {
          setMessages(messages => [
            ...messages,
            {
              id: value.id,
              role: value.role,
              content: value.content[0].text.value,
            },
          ]);
        },
        onTextPart(value) {
          // text delta - add to last message:
          setMessages(messages => {
            const lastMessage = messages[messages.length - 1];
            return [
              ...messages.slice(0, messages.length - 1),
              {
                id: lastMessage.id,
                role: lastMessage.role,
                content: lastMessage.content + value,
              },
            ];
          });
        },
        onAssistantControlDataPart(value) {
          setCurrentThreadId(value.threadId);

          // set id of last message:
          setMessages(messages => {
            const lastMessage = messages[messages.length - 1];
            lastMessage.id = value.messageId;
            return [...messages.slice(0, messages.length - 1), lastMessage];
          });
        },
        onDataMessagePart(value) {
          setMessages(messages => [
            ...messages,
            {
              id: value.id ?? generateId(),
              role: 'data',
              content: '',
              data: value.data,
            },
          ]);
        },
        onErrorPart(value) {
          setError(new Error(value));
        },
      });
    } catch (error) {
      // Ignore abort errors as they are expected when the user cancels the request:
      if (isAbortError(error) && abortController.signal.aborted) {
        abortControllerRef = null;
        return;
      }

      const onError = useAssistantOptions().onError?.();
      if (onError && error instanceof Error) {
        onError(error);
      }

      setError(error as Error);
    } finally {
      abortControllerRef = null;
      setStatus('awaiting_message');
    }
  };

  const submitMessage = async (
    event?: SubmitEvent,
    requestOptions?: {
      data?: Record<string, string>;
    },
  ) => {
    event?.preventDefault?.();

    if (input() === '') {
      return;
    }

    append({ role: 'user', content: input() }, requestOptions);
  };

  const setThreadId = (threadId: string | undefined) => {
    setCurrentThreadId(threadId);
    setMessages([]);
  };

  return {
    append,
    messages,
    setMessages,
    threadId: currentThreadId,
    setThreadId,
    input,
    setInput,
    handleInputChange,
    submitMessage,
    status,
    error,
    stop,
  };
}
