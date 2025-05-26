import {
  ChatStore,
  defaultChatStore,
  setChatStoreContext,
} from './chat-store.svelte.js';
import {
  KeyedCompletionStore,
  setCompletionContext,
} from './completion-context.svelte.js';
import {
  KeyedStructuredObjectStore,
  setStructuredObjectContext,
} from './structured-object-context.svelte.js';

export function createAIContext(chatStore?: ChatStore) {
  createChatStoreContext(chatStore);

  const completionStore = new KeyedCompletionStore();
  setCompletionContext(completionStore);

  const objectStore = new KeyedStructuredObjectStore();
  setStructuredObjectContext(objectStore);
}

export function createChatStoreContext(chatStore?: ChatStore) {
  setChatStoreContext(
    chatStore ??
      defaultChatStore({
        api: '/api/chat',
      }),
  );
}
