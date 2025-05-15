import {
  ChatStore,
  defaultChatStore,
  type DefaultChatStoreOptions,
  type UIDataTypes,
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
  DATA_TYPES extends UIDataTypes,
>(
  options: DefaultChatStoreOptions<MESSAGE_METADATA, DATA_TYPES> = {
    api: '/api/chat',
  },
) {
  const chatStore = defaultChatStore<MESSAGE_METADATA, DATA_TYPES>(options);
  setChatStoreContext(chatStore as ChatStore);
}
