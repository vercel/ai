import {
  ChatStore,
  type ChatStateManager,
  type UIDataTypes,
  type UIMessage,
  SerialJobExecutor,
  type ChatStatus,
  type ActiveResponse,
  type UIDataPartSchemas,
  type UIDataTypesSchemas,
} from 'ai';
import { createContext } from './utils.svelte.js';
import { defaultChatStore as defaultDefaultChatStore } from 'ai';

export const {
  hasContext: hasChatStoreContext,
  getContext: getChatStoreContext,
  setContext: setChatStoreContext,
} = createContext<ChatStore>('ChatStore');

export class SvelteStateManager<
  MESSAGE_METADATA,
  DATA_TYPES extends UIDataTypes,
> implements ChatStateManager<MESSAGE_METADATA, DATA_TYPES>
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
}

export class SvelteChatStore<
  MESSAGE_METADATA = unknown,
  DATA_TYPES extends UIDataTypesSchemas = UIDataTypesSchemas,
> extends ChatStore<MESSAGE_METADATA, DATA_TYPES> {
  constructor(
    arg: Omit<
      ConstructorParameters<typeof ChatStore<MESSAGE_METADATA, DATA_TYPES>>[0],
      'StateManager'
    >,
  ) {
    super({ ...arg, StateManager: SvelteStateManager });
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
    StateManager: SvelteStateManager,
  });
}
