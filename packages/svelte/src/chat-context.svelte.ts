import type { JSONValue, UIMessage } from '@ai-sdk/ui-utils';
import { createContext, KeyedStore } from './utils.svelte.js';

class ChatStore {
  messages = $state<UIMessage[]>([]);
  data = $state<JSONValue[]>();
  status = $state<'submitted' | 'streaming' | 'ready' | 'error'>('ready');
  error = $state<Error>();
}

export class KeyedChatStore extends KeyedStore<ChatStore> {
  constructor(
    value?: Iterable<readonly [string, ChatStore]> | null | undefined,
  ) {
    super(ChatStore, value);
  }
}

export const {
  hasContext: hasChatContext,
  getContext: getChatContext,
  setContext: setChatContext,
} = createContext<KeyedChatStore>('Chat');
