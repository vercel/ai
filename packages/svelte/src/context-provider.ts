import {
  ChatStore,
  defaultChatStore,
  type DefaultChatStoreOptions,
  type UIDataTypesSchemas,
} from 'ai';
import { KeyedChatStore, setChatContext } from './chat-context.svelte.js';
import { setChatStoreContext } from './chat-store-context.svelte.js';
import {
  KeyedCompletionStore,
  setCompletionContext,
} from './completion-context.svelte.js';
import {
  KeyedStructuredObjectStore,
  setStructuredObjectContext,
} from './structured-object-context.svelte.js';

export function createAIContext() {
  const chatStore = new KeyedChatStore();
  setChatContext(chatStore);

  const completionStore = new KeyedCompletionStore();
  setCompletionContext(completionStore);

  const objectStore = new KeyedStructuredObjectStore();
  setStructuredObjectContext(objectStore);
}

export function createChatStoreContext<
  MESSAGE_METADATA,
  UI_DATA_PART_SCHEMAS extends UIDataTypesSchemas,
>(
  options: DefaultChatStoreOptions<MESSAGE_METADATA, UI_DATA_PART_SCHEMAS> = {
    api: '/api/chat',
  },
) {
  const chatStore = defaultChatStore<MESSAGE_METADATA, UI_DATA_PART_SCHEMAS>(
    options,
  );
  setChatStoreContext(chatStore as ChatStore);
}
