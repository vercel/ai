import {
  ActiveResponse,
  ChatStateManager,
  ChatStatus,
  ChatStore,
  SerialJobExecutor,
  UIDataPartSchemas,
  UIDataTypes,
  UIDataTypesSchemas,
  UIMessage,
  defaultChatStore as defaultDefaultChatStore,
} from 'ai';

export class ReactStateManager<MESSAGE_METADATA, DATA_TYPES extends UIDataTypes>
  implements ChatStateManager<MESSAGE_METADATA, DATA_TYPES>
{
  messages: UIMessage<MESSAGE_METADATA, DATA_TYPES>[];
  status: ChatStatus = 'ready';
  error: Error | undefined = undefined;
  activeResponse: ActiveResponse<MESSAGE_METADATA> | undefined = undefined;
  jobExecutor = new SerialJobExecutor();

  constructor(messages?: UIMessage<MESSAGE_METADATA, DATA_TYPES>[]) {
    this.messages = messages ?? [];
  }

  setStatus = (status: ChatStatus) => {
    this.status = status;
  };

  setError = (error: Error | undefined) => {
    this.error = error;
  };

  setActiveResponse = (
    activeResponse: ActiveResponse<MESSAGE_METADATA> | undefined,
  ) => {
    this.activeResponse = activeResponse;
  };

  setMessages = (messages: UIMessage<MESSAGE_METADATA, DATA_TYPES>[]) => {
    this.messages = [...messages];
  };

  pushMessage = (message: UIMessage<MESSAGE_METADATA, DATA_TYPES>) => {
    this.messages = this.messages.concat(message);
  };

  popMessage = () => {
    this.messages = this.messages.slice(0, -1);
  };

  replaceMessage = (
    index: number,
    message: UIMessage<MESSAGE_METADATA, DATA_TYPES>,
  ) => {
    this.messages = [
      ...this.messages.slice(0, index),
      message,
      ...this.messages.slice(index + 1),
    ];
  };
}

export class ReactChatStore<
  MESSAGE_METADATA = unknown,
  DATA_TYPES extends UIDataTypesSchemas = UIDataTypesSchemas,
> extends ChatStore<MESSAGE_METADATA, DATA_TYPES> {
  constructor(
    arg: Omit<
      ConstructorParameters<typeof ChatStore<MESSAGE_METADATA, DATA_TYPES>>[0],
      'StateManager'
    >,
  ) {
    super({ ...arg, StateManager: ReactStateManager });
  }
}

export function defaultChatStore<
  MESSAGE_METADATA = unknown,
  UI_DATA_PART_SCHEMAS extends UIDataPartSchemas = UIDataPartSchemas,
>(
  args: Omit<
    Parameters<
      typeof defaultDefaultChatStore<MESSAGE_METADATA, UI_DATA_PART_SCHEMAS>
    >[0],
    'StateManager'
  >,
): ReturnType<
  typeof defaultDefaultChatStore<MESSAGE_METADATA, UI_DATA_PART_SCHEMAS>
> {
  return defaultDefaultChatStore<MESSAGE_METADATA, UI_DATA_PART_SCHEMAS>({
    ...args,
    StateManager: ReactStateManager,
  });
}
