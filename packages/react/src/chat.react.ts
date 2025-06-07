import {
  AbstractChat,
  ChatInit,
  ChatState,
  ChatStatus,
  UIDataPartSchemas,
  UIDataTypes,
  UIMessage,
} from 'ai';

class ReactChatState<MESSAGE_METADATA, DATA_TYPES extends UIDataTypes>
  implements ChatState<MESSAGE_METADATA, DATA_TYPES>
{
  #messages: UIMessage<MESSAGE_METADATA, DATA_TYPES>[];
  status: ChatStatus = 'ready';
  error: Error | undefined = undefined;

  constructor(messages: UIMessage<MESSAGE_METADATA, DATA_TYPES>[] = []) {
    this.#messages = messages;
  }

  get messages() {
    return this.#messages;
  }

  set messages(messages: UIMessage<MESSAGE_METADATA, DATA_TYPES>[]) {
    this.#messages = [...messages];
  }

  pushMessage = (message: UIMessage<MESSAGE_METADATA, DATA_TYPES>) => {
    this.#messages = this.messages.concat(message);
  };

  popMessage = () => {
    this.#messages = this.messages.slice(0, -1);
  };

  replaceMessage = (
    index: number,
    message: UIMessage<MESSAGE_METADATA, DATA_TYPES>,
  ) => {
    this.#messages = [
      ...this.#messages.slice(0, index),
      message,
      ...this.#messages.slice(index + 1),
    ];
  };

  snapshot = <T>(value: T): T => structuredClone(value);
}

export class Chat<
  MESSAGE_METADATA,
  UI_DATA_PART_SCHEMAS extends UIDataPartSchemas = UIDataPartSchemas,
> extends AbstractChat<MESSAGE_METADATA, UI_DATA_PART_SCHEMAS> {
  constructor({
    messages,
    ...init
  }: ChatInit<MESSAGE_METADATA, UI_DATA_PART_SCHEMAS>) {
    super({ ...init, state: new ReactChatState(messages) });
  }
}
