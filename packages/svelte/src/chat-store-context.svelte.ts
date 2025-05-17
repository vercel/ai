import { ChatStore } from 'ai';
import { createContext } from './utils.svelte.js';

export const {
  hasContext: hasChatStoreContext,
  getContext: getChatStoreContext,
  setContext: setChatStoreContext,
} = createContext<ChatStore>('ChatStore');
