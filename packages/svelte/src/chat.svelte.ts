import {
  AbstractChat,
  type AbstractChatInit,
  type ChatRequestOptions,
  type ChatState,
  type ChatStatus,
  type CreateUIMessage,
  DefaultChatTransport,
  type IdGenerator,
  type InferUIDataParts,
  type UIDataPartSchemas,
  type UIDataTypes,
  type UIMessage,
  convertFileListToFileUIParts,
  generateId as generateIdFunc,
} from 'ai';

export type ChatInit<
  MESSAGE_METADATA = unknown,
  DATA_PART_SCHEMAS extends UIDataPartSchemas = UIDataPartSchemas,
> = Readonly<
  Omit<
    AbstractChatInit<MESSAGE_METADATA, DATA_PART_SCHEMAS>,
    'state' | 'id' | 'transport'
  >
> &
  Partial<
    Pick<
      AbstractChatInit<MESSAGE_METADATA, DATA_PART_SCHEMAS>,
      'id' | 'transport'
    >
  > & {
    /**
     * Initial input of the chat.
     */
    initialInput?: string;

    messages?: UIMessage<
      MESSAGE_METADATA,
      InferUIDataParts<DATA_PART_SCHEMAS>
    >[];
  };

export type { CreateUIMessage, UIMessage };

export class Chat<
  MESSAGE_METADATA = unknown,
  DATA_PART_SCHEMAS extends UIDataPartSchemas = UIDataPartSchemas,
> extends AbstractChat<MESSAGE_METADATA, DATA_PART_SCHEMAS> {
  #generateId: IdGenerator;

  /** The current value of the input. Writable, so it can be bound to form inputs. */
  input: string;

  constructor(init: ChatInit<MESSAGE_METADATA, DATA_PART_SCHEMAS>) {
    super({
      ...init,
      id: init.id ?? init.generateId?.() ?? generateIdFunc(),
      transport:
        init.transport ??
        new DefaultChatTransport({
          api: '/api/chat',
        }),
      state: new SvelteChatState(init.messages),
    });

    this.input = $state(init.initialInput ?? '');
    this.#generateId = init.generateId ?? generateIdFunc;
  }

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
}

class SvelteChatState<MESSAGE_METADATA, DATA_TYPES extends UIDataTypes>
  implements ChatState<MESSAGE_METADATA, DATA_TYPES>
{
  messages: UIMessage<MESSAGE_METADATA, DATA_TYPES>[];
  status = $state<ChatStatus>('ready');
  error = $state<Error | undefined>(undefined);

  constructor(messages?: UIMessage<MESSAGE_METADATA, DATA_TYPES>[]) {
    this.messages = $state(messages ?? []);
  }

  setMessages = (messages: UIMessage<MESSAGE_METADATA, DATA_TYPES>[]) => {
    this.messages = messages;
  };

  pushMessage = (message: UIMessage<MESSAGE_METADATA, DATA_TYPES>) => {
    this.messages.push(message);
  };

  popMessage = () => {
    this.messages.pop();
  };

  replaceMessage = (
    index: number,
    message: UIMessage<MESSAGE_METADATA, DATA_TYPES>,
  ) => {
    this.messages[index] = message;
  };

  snapshot = <T>(thing: T): T => {
    return $state.snapshot(thing) as T;
  };
}
