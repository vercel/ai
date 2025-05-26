import { type UIDataTypes, type UIMessage } from 'ai';
import {
  type ActiveResponse,
  ChatStore as BaseChatStore,
  defaultChatStore as baseDefaultChatStore,
  type Chat,
  type ChatStatus,
  SerialJobExecutor,
  type UIDataPartSchemas,
} from 'ai/internal';
import { createContext } from './utils.svelte.js';

export const {
  hasContext: hasChatStoreContext,
  getContext: getChatStoreContext,
  setContext: setChatStoreContext,
} = createContext<BaseChatStore>('ChatStore');

class SvelteChat<MESSAGE_METADATA, DATA_TYPES extends UIDataTypes>
  implements Chat<MESSAGE_METADATA, DATA_TYPES>
{
  messages: UIMessage<MESSAGE_METADATA, DATA_TYPES>[];
  status = $state<ChatStatus>('ready');
  error = $state<Error | undefined>(undefined);
  activeResponse: ActiveResponse<MESSAGE_METADATA> | undefined = undefined;
  jobExecutor = new SerialJobExecutor();

  constructor(messages?: UIMessage<MESSAGE_METADATA, DATA_TYPES>[]) {
    this.messages = $state(messages ?? []);
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

export class ChatStore<
  MESSAGE_METADATA = unknown,
  DATA_TYPES extends UIDataPartSchemas = UIDataPartSchemas,
> extends BaseChatStore<MESSAGE_METADATA, DATA_TYPES> {
  constructor(
    arg: Omit<
      ConstructorParameters<
        typeof BaseChatStore<MESSAGE_METADATA, DATA_TYPES>
      >[0],
      'createChat'
    >,
  ) {
    super({
      ...arg,
      createChat: options => new SvelteChat(options.messages),
    });
  }
}

export function defaultChatStore<
  MESSAGE_METADATA = unknown,
  UI_DATA_PART_SCHEMAS extends UIDataPartSchemas = UIDataPartSchemas,
>(
  args: Omit<
    Parameters<
      typeof baseDefaultChatStore<MESSAGE_METADATA, UI_DATA_PART_SCHEMAS>
    >[0],
    'createChat'
  >,
): ReturnType<
  typeof baseDefaultChatStore<MESSAGE_METADATA, UI_DATA_PART_SCHEMAS>
> {
  return baseDefaultChatStore<MESSAGE_METADATA, UI_DATA_PART_SCHEMAS>({
    ...args,
    createChat: options => new SvelteChat(options.messages),
  });
}
