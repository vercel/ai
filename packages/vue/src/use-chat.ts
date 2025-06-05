import type {
  AbstractChatInit,
  ChatRequestOptions,
  ChatStatus,
  ChatStore,
  CreateUIMessage,
  FileUIPart,
  InferUIDataParts,
  UIDataPartSchemas,
  UIMessage,
  UseChatOptions,
} from 'ai';
import { convertFileListToFileUIParts } from 'ai';
import type { Ref } from 'vue';
import { computed, ref } from 'vue';
import { Chat, ChatInit } from './chat.vue';

export type { CreateUIMessage, UIMessage, UseChatOptions };

export type UseChatOptions2<
  MESSAGE_METADATA = unknown,
  DATA_TYPE_SCHEMAS extends UIDataPartSchemas = UIDataPartSchemas,
> = (
  | { chat: Chat<MESSAGE_METADATA, DATA_TYPE_SCHEMAS> }
  | ChatInit<MESSAGE_METADATA, DATA_TYPE_SCHEMAS>
) & {
  /**
  /**
   * Initial input of the chat.
   */
  initialInput?: string;
} & Pick<
    AbstractChatInit<MESSAGE_METADATA, DATA_TYPE_SCHEMAS>,
    'onToolCall' | 'onFinish' | 'onError'
  >;

export type UseChatHelpers<
  MESSAGE_METADATA = unknown,
  DATA_PART_SCHEMAS extends UIDataPartSchemas = UIDataPartSchemas,
> = {
  /**
   * The id of the chat.
   */
  readonly id: string;

  /** Current messages in the chat */
  readonly messages: Ref<
    UIMessage<MESSAGE_METADATA, InferUIDataParts<DATA_PART_SCHEMAS>>[]
  >;

  /** The error object of the API request */
  readonly error: Ref<Error | undefined>;

  /**
   * Append a user message to the chat list. This triggers the API call to fetch
   * the assistant's response.
   *
   * @param message The message to append
   * @param options Additional options to pass to the API call
   */
  append: (
    message: CreateUIMessage<
      MESSAGE_METADATA,
      InferUIDataParts<DATA_PART_SCHEMAS>
    >,
    options?: ChatRequestOptions,
  ) => Promise<void>;

  /**
   * Reload the last AI chat response for the given chat history. If the last
   * message isn't from the assistant, it will request the API to generate a
   * new response.
   */
  reload: (chatRequestOptions?: ChatRequestOptions) => Promise<void>;

  /**
   * Abort the current request immediately, keep the generated tokens if any.
   */
  stop: () => void;

  /**
   * Update the `messages` state locally. This is useful when you want to
   * edit the messages on the client, and then trigger the `reload` method
   * manually to regenerate the AI response.
   */
  setMessages: (
    messages:
      | UIMessage<MESSAGE_METADATA, InferUIDataParts<DATA_PART_SCHEMAS>>[]
      | ((
          messages: UIMessage<
            MESSAGE_METADATA,
            InferUIDataParts<DATA_PART_SCHEMAS>
          >[],
        ) => UIMessage<
          MESSAGE_METADATA,
          InferUIDataParts<DATA_PART_SCHEMAS>
        >[]),
  ) => void;

  /** The current value of the input */
  input: Ref<string>;

  /** Form submission handler to automatically reset input and append a user message  */
  handleSubmit: (
    event?: { preventDefault?: () => void },
    chatRequestOptions?: ChatRequestOptions & {
      files?: FileList | FileUIPart[];
    },
  ) => void;

  /**
   * Hook status:
   *
   * - `submitted`: The message has been sent to the API and we're awaiting the start of the response stream.
   * - `streaming`: The response is actively streaming in from the API, receiving chunks of data.
   * - `ready`: The full response has been received and processed; a new user message can be submitted.
   * - `error`: An error occurred during the API request, preventing successful completion.
   */
  status: Ref<ChatStatus>;

  addToolResult: ({
    toolCallId,
    result,
  }: {
    toolCallId: string;
    result: any;
  }) => void;
};

export function useChat<
  MESSAGE_METADATA = unknown,
  DATA_PART_SCHEMAS extends UIDataPartSchemas = UIDataPartSchemas,
>({
  initialInput = '',
  ...options
}: UseChatOptions2<MESSAGE_METADATA, DATA_PART_SCHEMAS> = {}): UseChatHelpers<
  MESSAGE_METADATA,
  DATA_PART_SCHEMAS
> {
  const chat = 'chat' in options ? options.chat : new Chat(options);

  const messages = computed(() => chat.messages);
  const status = computed(() => chat.status);
  const error = computed(() => chat.error);

  const append = async (
    message: CreateUIMessage<
      MESSAGE_METADATA,
      InferUIDataParts<DATA_PART_SCHEMAS>
    >,
    { headers, body }: ChatRequestOptions = {},
  ) => chat.append(message, { headers, body });

  const reload = async ({ headers, body }: ChatRequestOptions = {}) =>
    chat.reload({ headers, body });

  const stop = () => chat.stop();

  const setMessages = (
    messagesParam:
      | UIMessage<MESSAGE_METADATA, InferUIDataParts<DATA_PART_SCHEMAS>>[]
      | ((
          messages: UIMessage<
            MESSAGE_METADATA,
            InferUIDataParts<DATA_PART_SCHEMAS>
          >[],
        ) => UIMessage<
          MESSAGE_METADATA,
          InferUIDataParts<DATA_PART_SCHEMAS>
        >[]),
  ) => {
    if (typeof messagesParam === 'function') {
      messagesParam = messagesParam(chat.messages);
    }

    chat.messages = messagesParam;
  };

  const input = ref(initialInput);

  const handleSubmit = async (
    event?: { preventDefault?: () => void },
    options: ChatRequestOptions & { files?: FileList | FileUIPart[] } = {},
  ) => {
    event?.preventDefault?.();

    const inputValue = input.value;

    const fileParts = Array.isArray(options?.files)
      ? options.files
      : await convertFileListToFileUIParts(options?.files);

    if (!inputValue && fileParts.length === 0) return;

    await append(
      {
        id: chat.generateId(),
        role: 'user',
        metadata: undefined,
        parts: [...fileParts, { type: 'text', text: inputValue }],
      },
      {
        headers: options.headers,
        body: options.body,
      },
    );

    input.value = '';
  };

  const addToolResult = (
    options: Omit<
      Parameters<
        ChatStore<MESSAGE_METADATA, DATA_PART_SCHEMAS>['addToolResult']
      >[0],
      'chatId'
    >,
  ) => chat.addToolResult(options);

  return {
    id: chat.id,
    messages,
    append,
    error,
    reload,
    stop,
    setMessages,
    input,
    handleSubmit,
    status,
    addToolResult,
  };
}
