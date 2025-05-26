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
import { createContext } from './utils.svelte.js';

export const {
  hasContext: hasChatStoreContext,
  getContext: getChatStoreContext,
  setContext: setChatStoreContext,
} = createContext<ChatStore>('ChatStore');

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

export function createChatStore<
  MESSAGE_METADATA = unknown,
  DATA_PART_SCHEMAS extends UIDataPartSchemas = UIDataPartSchemas,
>(
  options: ChatStoreOptions<MESSAGE_METADATA, DATA_PART_SCHEMAS>,
): ChatStore<MESSAGE_METADATA, DATA_PART_SCHEMAS> {
  return new ChatStore<MESSAGE_METADATA, DATA_PART_SCHEMAS>({
    ...options,
    createChat: options =>
      new SvelteChat<MESSAGE_METADATA, InferUIDataParts<DATA_PART_SCHEMAS>>(
        options.messages,
      ),
  });
}
