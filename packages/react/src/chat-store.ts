import {
  ChatStatus,
  ChatStore,
  ChatStoreOptions,
  InferUIDataParts,
  UIDataPartSchemas,
  UIDataTypes,
  UIMessage,
} from 'ai';
import {
  ActiveResponse,
  defaultChatStoreOptions,
  Chat,
  SerialJobExecutor,
  DefaultChatStoreOptions,
} from 'ai/internal';

class ReactChat<MESSAGE_METADATA, DATA_TYPES extends UIDataTypes>
  implements Chat<MESSAGE_METADATA, DATA_TYPES>
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

  snapshot = <T>(value: T): T => {
    return structuredClone(value);
  };
}

export function createChatStore<
  MESSAGE_METADATA = unknown,
  DATA_PART_SCHEMAS extends UIDataPartSchemas = UIDataPartSchemas,
>(
  options: ChatStoreOptions<MESSAGE_METADATA, DATA_PART_SCHEMAS>,
): ChatStore<MESSAGE_METADATA, DATA_PART_SCHEMAS> {
  return new ChatStore<MESSAGE_METADATA, DATA_PART_SCHEMAS>({
    ...options,
    createChat: options =>
      new ReactChat<MESSAGE_METADATA, InferUIDataParts<DATA_PART_SCHEMAS>>(
        options.messages,
      ),
  });
}

export function defaultChatStore<
  MESSAGE_METADATA = unknown,
  DATA_PART_SCHEMAS extends UIDataPartSchemas = UIDataPartSchemas,
>(
  options: DefaultChatStoreOptions<MESSAGE_METADATA, DATA_PART_SCHEMAS>,
): ChatStore<MESSAGE_METADATA, DATA_PART_SCHEMAS> {
  return new ChatStore<MESSAGE_METADATA, DATA_PART_SCHEMAS>({
    ...defaultChatStoreOptions(options),
    createChat: options =>
      new ReactChat<MESSAGE_METADATA, InferUIDataParts<DATA_PART_SCHEMAS>>(
        options.messages,
      ),
  });
}
