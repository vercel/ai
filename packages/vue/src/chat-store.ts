import {
  ChatStore,
  SerialJobExecutor,
  type ActiveResponse,
  type Chat,
  type ChatStatus,
  type ChatStoreOptions,
  type InferUIDataParts,
  type UIDataPartSchemas,
  type UIDataTypes,
  type UIMessage,
} from 'ai';
import { Ref, ref } from 'vue';

class VueChat<MESSAGE_METADATA, DATA_TYPES extends UIDataTypes>
  implements Chat<MESSAGE_METADATA, DATA_TYPES>
{
  private messagesRef: Ref<UIMessage<MESSAGE_METADATA, DATA_TYPES>[]>;
  private statusRef = ref<ChatStatus>('ready');
  private errorRef = ref<Error | undefined>(undefined);

  activeResponse: ActiveResponse<MESSAGE_METADATA> | undefined = undefined;
  jobExecutor = new SerialJobExecutor();

  constructor(messages?: UIMessage<MESSAGE_METADATA, DATA_TYPES>[]) {
    this.messagesRef = ref(messages ?? []) as Ref<
      UIMessage<MESSAGE_METADATA, DATA_TYPES>[]
    >;
  }

  get messages(): UIMessage<MESSAGE_METADATA, DATA_TYPES>[] {
    return this.messagesRef.value;
  }

  get status(): ChatStatus {
    return this.statusRef.value;
  }

  get error(): Error | undefined {
    return this.errorRef.value;
  }

  setStatus = (status: ChatStatus) => {
    this.statusRef.value = status;
  };

  setError = (error: Error | undefined) => {
    this.errorRef.value = error;
  };

  setActiveResponse = (
    activeResponse: ActiveResponse<MESSAGE_METADATA> | undefined,
  ) => {
    this.activeResponse = activeResponse;
  };

  setMessages = (messages: UIMessage<MESSAGE_METADATA, DATA_TYPES>[]) => {
    this.messagesRef.value = messages;
  };

  pushMessage = (message: UIMessage<MESSAGE_METADATA, DATA_TYPES>) => {
    this.messagesRef.value.push(message);
  };

  popMessage = () => {
    this.messagesRef.value.pop();
  };

  replaceMessage = (
    index: number,
    message: UIMessage<MESSAGE_METADATA, DATA_TYPES>,
  ) => {
    // message is cloned here because vue's deep reactivity shows unexpected behavior, particularly when updating tool invocation parts
    this.messagesRef.value[index] = { ...message };
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
      new VueChat<MESSAGE_METADATA, InferUIDataParts<DATA_PART_SCHEMAS>>(
        options.messages,
      ),
  });
}
