import { StandardSchemaV1, Validator } from '@ai-sdk/provider-utils';
import {
  AbstractChat,
  ChatState,
  ChatStatus,
  ChatTransport,
  InferUIDataParts,
  SerialJobExecutor,
  UIDataPartSchemas,
  UIDataTypes,
  UIMessage,
  UseChatOptions,
  type ActiveResponse,
} from 'ai';

class ReactChatState<MESSAGE_METADATA, DATA_TYPES extends UIDataTypes>
  implements ChatState<MESSAGE_METADATA, DATA_TYPES>
{
  messages: UIMessage<MESSAGE_METADATA, DATA_TYPES>[];
  status: ChatStatus = 'ready';
  error: Error | undefined = undefined;
  activeResponse: ActiveResponse<MESSAGE_METADATA> | undefined = undefined;
  jobExecutor = new SerialJobExecutor();

  constructor(messages?: UIMessage<MESSAGE_METADATA, DATA_TYPES>[]) {
    this.messages = messages ?? [];
  }

  getStatus = () => {
    return this.status;
  };

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

export class ReactChat2<
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
  }: {
    id: string;
    messages?: UIMessage<
      MESSAGE_METADATA,
      InferUIDataParts<UI_DATA_PART_SCHEMAS>
    >[];
    generateId?: UseChatOptions['generateId'];
    transport: ChatTransport<
      MESSAGE_METADATA,
      InferUIDataParts<UI_DATA_PART_SCHEMAS>
    >;
    maxSteps?: number;
    messageMetadataSchema?:
      | Validator<MESSAGE_METADATA>
      | StandardSchemaV1<MESSAGE_METADATA>;
    dataPartSchemas?: UI_DATA_PART_SCHEMAS;
  }) {
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

  get status(): ChatStatus {
    return this.state.getStatus();
  }

  get messages(): UIMessage<
    MESSAGE_METADATA,
    InferUIDataParts<UI_DATA_PART_SCHEMAS>
  >[] {
    return this.state.messages;
  }
}
