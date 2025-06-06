import {
  AbstractChat,
  ChatInit as BaseChatInit,
  ChatState,
  ChatStatus,
  UIDataPartSchemas,
  UIDataTypes,
  UIMessage,
} from 'ai';
import { Ref, ref } from 'vue';

class VueChatState<MESSAGE_METADATA, DATA_TYPES extends UIDataTypes>
  implements ChatState<MESSAGE_METADATA, DATA_TYPES>
{
  private messagesRef: Ref<UIMessage<MESSAGE_METADATA, DATA_TYPES>[]>;
  private statusRef = ref<ChatStatus>('ready');
  private errorRef = ref<Error | undefined>(undefined);

  constructor(messages?: UIMessage<MESSAGE_METADATA, DATA_TYPES>[]) {
    this.messagesRef = ref(messages ?? []) as Ref<
      UIMessage<MESSAGE_METADATA, DATA_TYPES>[]
    >;
  }

  get messages(): UIMessage<MESSAGE_METADATA, DATA_TYPES>[] {
    return this.messagesRef.value;
  }

  set messages(messages: UIMessage<MESSAGE_METADATA, DATA_TYPES>[]) {
    this.messagesRef.value = messages;
  }

  get status(): ChatStatus {
    return this.statusRef.value;
  }

  set status(status: ChatStatus) {
    this.statusRef.value = status;
  }

  get error(): Error | undefined {
    return this.errorRef.value;
  }

  set error(error: Error | undefined) {
    this.errorRef.value = error;
  }

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

  snapshot = <T>(value: T): T => value;
}

export class Chat<
  MESSAGE_METADATA,
  UI_DATA_PART_SCHEMAS extends UIDataPartSchemas = UIDataPartSchemas,
> extends AbstractChat<MESSAGE_METADATA, UI_DATA_PART_SCHEMAS> {
  constructor({
    messages,
    ...init
  }: BaseChatInit<MESSAGE_METADATA, UI_DATA_PART_SCHEMAS>) {
    super({
      ...init,
      state: new VueChatState(messages),
    });
  }
}
