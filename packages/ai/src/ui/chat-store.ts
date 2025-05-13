import type { UIMessage } from './ui-messages';

export interface ChatStoreSubscriber {
  onChatChanged: (event: ChatStoreEvent) => void;
}

export interface ChatStoreEvent {
  type: 'chat-messages-changed' | 'chat-status-changed';
  chatId: number | string;
  error?: Error;
}

export type ChatStatus = 'submitted' | 'streaming' | 'ready' | 'error';

export interface Chat<MESSAGE_METADATA> {
  status: ChatStatus;
  messages: UIMessage<MESSAGE_METADATA>[];
  error?: Error;
}

export class ChatStore<MESSAGE_METADATA> {
  private chats: Map<string, Chat<MESSAGE_METADATA>>;
  private subscribers: Set<ChatStoreSubscriber>;

  constructor({
    chats = {},
  }: {
    chats?: {
      [id: string]: {
        messages: UIMessage<MESSAGE_METADATA>[];
      };
    };
  } = {}) {
    this.chats = new Map(
      Object.entries(chats).map(([id, state]) => [
        id,
        {
          messages: [...state.messages],
          status: 'ready',
          activeResponse: undefined,
          error: undefined,
        },
      ]),
    );
    this.subscribers = new Set();
  }

  hasChat(id: string) {
    return this.chats.has(id);
  }

  addChat(id: string, messages: UIMessage<MESSAGE_METADATA>[]) {
    this.chats.set(id, {
      messages,
      status: 'ready',
    });
  }

  getChats() {
    return Array.from(this.chats.entries());
  }

  get chatCount() {
    return this.chats.size;
  }

  getStatus(id: string): ChatStatus {
    return this.getChat(id).status;
  }

  setStatus({
    id,
    status,
    error,
  }: {
    id: string;
    status: Chat<MESSAGE_METADATA>['status'];
    error?: Error;
  }) {
    const chat = this.getChat(id);

    if (chat.status === status) return;

    chat.status = status;
    chat.error = error;

    this.emitEvent({ type: 'chat-status-changed', chatId: id, error });
  }

  getError(id: string) {
    return this.getChat(id).error;
  }

  getMessages(id: string) {
    return this.getChat(id).messages;
  }

  getLastMessage(id: string) {
    const chat = this.getChat(id);
    return chat.messages[chat.messages.length - 1];
  }

  subscribe(subscriber: ChatStoreSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  setMessages({
    id,
    messages,
  }: {
    id: string;
    messages: UIMessage<MESSAGE_METADATA>[];
  }) {
    const chat = this.getChat(id);

    chat.messages = [...messages];
    this.emitEvent({ type: 'chat-messages-changed', chatId: id });
  }

  appendMessage({
    id,
    message,
  }: {
    id: string;
    message: UIMessage<MESSAGE_METADATA>;
  }) {
    const chat = this.getChat(id);

    chat.messages = [...chat.messages, { ...message }];
    this.emitEvent({ type: 'chat-messages-changed', chatId: id });
  }

  removeAssistantResponse(id: string) {
    const chat = this.getChat(id);

    const lastMessage = chat.messages[chat.messages.length - 1];

    if (lastMessage == null) {
      throw new Error('Cannot remove assistant response from empty chat');
    }

    if (lastMessage.role !== 'assistant') {
      throw new Error('Last message is not an assistant message');
    }

    this.setMessages({ id, messages: chat.messages.slice(0, -1) });
  }

  private emitEvent(event: ChatStoreEvent) {
    for (const subscriber of this.subscribers) {
      subscriber.onChatChanged(event);
    }
  }

  private getChat(id: string): Chat<MESSAGE_METADATA> {
    if (!this.hasChat(id)) {
      throw new Error(`chat '${id}' not found`); // TODO AI SDK error
    }
    return this.chats.get(id)!;
  }
}
