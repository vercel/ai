import type { JSONValue, UIMessage } from 'ai';
import { createContext, KeyedStore } from './utils.svelte.js';

class ChatStore<MESSAGE_METADATA = unknown> {
  messages = $state<UIMessage<MESSAGE_METADATA>[]>([]);
  data = $state<JSONValue[]>([]);
  status = $state<'submitted' | 'streaming' | 'ready' | 'error'>('ready');
  error = $state<Error>();
}

export class KeyedChatStore<MESSAGE_METADATA = unknown> extends KeyedStore<
  ChatStore<MESSAGE_METADATA>
> {
  constructor(
    value?:
      | Iterable<readonly [string, ChatStore<MESSAGE_METADATA>]>
      | null
      | undefined,
  ) {
    super(ChatStore, value);
  }
}

export const {
  hasContext: hasChatContext,
  getContext: getChatContext,
  setContext: setChatContext,
} = createContext<KeyedChatStore>('Chat');
