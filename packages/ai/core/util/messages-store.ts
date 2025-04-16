import { generateId } from '.';
import type { ToolInvocation, ToolInvocationUIPart, UIMessage } from '../types';

type SubscriberCallback = () => void;

/**
 * Internal class for managing UIMessages
 */
export class MessagesStore {
  chatId: string;
  private messages: UIMessage[] = [];
  private subscribers: Set<SubscriberCallback> = new Set();
  private notify: () => void;

  constructor({
    chatId = generateId(),
    initialMessages,
    throttleMs,
  }: {
    initialMessages: UIMessage[];
    throttleMs?: number;
    chatId?: string;
  }) {
    this.messages = initialMessages;
    this.chatId = chatId;
    this.notify = () => this.emit();
    // TODO: Install `throttleit` + move throttle.ts
    // this.notify = throttleMs
    //   ? throttle(() => this.emit(), throttleMs)
    //   : () => this.emit();
  }

  private emit() {
    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }

  onChange(callback: SubscriberCallback): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  getMessages(): UIMessage[] {
    return this.messages;
  }

  getLastMessage(): UIMessage | undefined {
    return this.messages[this.messages.length - 1];
  }

  removeLastMessage(role: 'assistant' | 'user' = 'assistant') {
    const lastMessage = this.getLastMessage();
    if (lastMessage?.role === role) {
      this.setMessages(this.messages.slice(0, -1));
    }
  }

  setMessages(messages: UIMessage[]) {
    this.messages = messages;
    this.notify();
  }

  appendMessage(message: UIMessage) {
    this.setMessages([...this.messages, message]);
  }

  updateLastMessage(message: UIMessage) {
    this.setMessages([...this.messages.slice(0, -1), message]);
  }

  updateToolCallResult({
    toolCallId,
    result,
  }: {
    toolCallId: string;
    result: unknown;
  }) {
    const lastMessage = this.getLastMessage();
    if (!lastMessage) return;

    const invocationPart = lastMessage.parts.find(
      (part): part is ToolInvocationUIPart =>
        part.type === 'tool-invocation' &&
        part.toolInvocation.toolCallId === toolCallId,
    );

    if (!invocationPart) return;

    const toolResult: ToolInvocation = {
      ...invocationPart.toolInvocation,
      state: 'result',
      result,
    };

    invocationPart.toolInvocation = toolResult;

    lastMessage.toolInvocations = lastMessage.toolInvocations?.map(
      toolInvocation =>
        toolInvocation.toolCallId === toolCallId ? toolResult : toolInvocation,
    );

    this.setMessages([...this.messages.slice(0, -1), { ...lastMessage }]);
  }

  clear() {
    this.messages = [];
    this.notify();
  }
}
