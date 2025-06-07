import {
  AbstractChat,
  type ChatInit,
  type ChatState,
  type ChatStatus,
  type CreateUIMessage,
  type UIDataPartSchemas,
  type UIDataTypes,
  type UIMessage,
} from 'ai';

export type { CreateUIMessage, UIMessage };

export class Chat<
  MESSAGE_METADATA = unknown,
  DATA_PART_SCHEMAS extends UIDataPartSchemas = UIDataPartSchemas,
> extends AbstractChat<MESSAGE_METADATA, DATA_PART_SCHEMAS> {
  constructor(init: ChatInit<MESSAGE_METADATA, DATA_PART_SCHEMAS>) {
    super({
      ...init,
      state: new SvelteChatState(init.messages),
    });
  }
}

class SvelteChatState<MESSAGE_METADATA, DATA_TYPES extends UIDataTypes>
  implements ChatState<MESSAGE_METADATA, DATA_TYPES>
{
  messages: UIMessage<MESSAGE_METADATA, DATA_TYPES>[];
  status = $state<ChatStatus>('ready');
  error = $state<Error | undefined>(undefined);

  constructor(messages: UIMessage<MESSAGE_METADATA, DATA_TYPES>[] = []) {
    this.messages = $state(messages);
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

  snapshot = <T>(thing: T): T => $state.snapshot(thing) as T;
}
