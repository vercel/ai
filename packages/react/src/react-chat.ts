import {
  AbstractChat,
  AbstractChatInit,
  ChatState,
  ChatStatus,
  InferUIDataParts,
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

  constructor(messages?: UIMessage<MESSAGE_METADATA, DATA_TYPES>[]) {
    this.#messages = messages ?? [];
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

  snapshot = <T>(value: T): T => {
    return structuredClone(value);
  };
}

export type ChatInit<
  MESSAGE_METADATA = unknown,
  DATA_PART_SCHEMAS extends UIDataPartSchemas = UIDataPartSchemas,
> = Readonly<
  Omit<AbstractChatInit<MESSAGE_METADATA, DATA_PART_SCHEMAS>, 'state'>
> & {
  messages: UIMessage<MESSAGE_METADATA, InferUIDataParts<DATA_PART_SCHEMAS>>[];
};

export class Chat2<
  MESSAGE_METADATA,
  UI_DATA_PART_SCHEMAS extends UIDataPartSchemas = UIDataPartSchemas,
> extends AbstractChat<MESSAGE_METADATA, UI_DATA_PART_SCHEMAS> {
  constructor({
    id,
    generateId,
    transport,
    maxSteps = 1,
    messageMetadataSchema,
    dataPartSchemas,
    messages,
  }: ChatInit<MESSAGE_METADATA, UI_DATA_PART_SCHEMAS>) {
    super({
      id,
      generateId,
      transport,
      maxSteps,
      messageMetadataSchema,
      dataPartSchemas,
      state: new ReactChatState(messages),
    });
  }
}
