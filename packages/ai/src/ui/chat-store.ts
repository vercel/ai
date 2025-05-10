import { parsePartialJson } from '../util';
import type {
  ReasoningUIPart,
  TextUIPart,
  ToolInvocation,
  ToolInvocationUIPart,
  UIMessage,
} from './ui-messages';

interface ChatStoreSubscriber {
  id: string;
  onChatChanged: (event: ChatStoreEvent) => void;
}

export enum ChatStoreEvent {
  ChatMessagesChanged = 'chat-messages-changed',
  ChatStatusChanged = 'chat-status-changed',
  ChatErrorChanged = 'chat-error-changed',
}

export interface ChatStoreInitialization {
  chats?: Record<string, Pick<ChatState, 'messages'>>;
  getCurrentDate?: () => Date;
}

export interface ChatState {
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  messages: UIMessage[];
  activeResponse?: {
    message: UIMessage & { revisionId?: string };
    partialState: {
      textPart?: TextUIPart;
      reasoningPart?: ReasoningUIPart;
      toolParts?: Record<string, ToolInvocationUIPart>;
    };
  };
  error?: Error;
}

export class ChatStore {
  private chats: Map<string, ChatState>;
  private subscribers: Map<string, Set<ChatStoreSubscriber>>;
  private getCurrentDate: () => Date;

  constructor({
    chats = {},
    getCurrentDate: customGetCurrentDate = () => new Date(),
  }: ChatStoreInitialization = {}) {
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
    this.subscribers = new Map();
    this.getCurrentDate = customGetCurrentDate;
  }

  hasChat(id: string) {
    return this.chats.has(id);
  }

  addChat(id: string, messages: UIMessage[]) {
    this.chats.set(id, {
      messages,
      status: 'ready',
      activeResponse: undefined,
    });
  }

  get chatCount() {
    return this.chats.size;
  }

  getStatus(id: string) {
    const chat = this.chats.get(id);
    if (!chat) return;
    return chat.status;
  }

  setStatus({ id, status }: { id: string; status: ChatState['status'] }) {
    const chat = this.chats.get(id);
    if (!chat || chat.status === status) return;
    chat.status = status;
    this.emitEvent({ id, event: ChatStoreEvent.ChatStatusChanged });
  }

  getError(id: string) {
    const chat = this.chats.get(id);
    if (!chat) return;
    return chat.error;
  }

  setError({ id, error }: { id: string; error: ChatState['error'] }) {
    const chat = this.chats.get(id);
    if (!chat) return;
    chat.error = error;
    this.emitEvent({ id, event: ChatStoreEvent.ChatErrorChanged });
  }

  getMessages(id: string) {
    const chat = this.chats.get(id);
    if (!chat) return;
    return chat.messages;
  }

  getLastMessage(id: string) {
    const chat = this.chats.get(id);
    if (!chat) return;
    return chat.messages[chat.messages.length - 1];
  }

  subscribe(subscriber: ChatStoreSubscriber): () => void {
    const { id } = subscriber;

    if (!this.subscribers.has(id)) {
      this.subscribers.set(id, new Set());
    }

    this.subscribers.get(id)?.add(subscriber);

    return () => this.subscribers.get(id)?.delete(subscriber);
  }

  setMessages({ id, messages }: { id: string; messages: UIMessage[] }) {
    const chat = this.chats.get(id);
    if (!chat) return;

    chat.messages = [...messages];
    this.emitEvent({ id, event: ChatStoreEvent.ChatMessagesChanged });
  }

  appendMessage({ id, message }: { id: string; message: UIMessage }) {
    const chat = this.chats.get(id);
    if (!chat) return;

    if (message.role === 'user') {
      this.resetActiveResponse(id);
    }

    chat.messages = [...chat.messages, { ...message }];
    this.emitEvent({ id, event: ChatStoreEvent.ChatMessagesChanged });
  }

  removeAssistantResponse(id: string) {
    const chat = this.chats.get(id);
    if (!chat) return;

    const lastMessage = chat.messages[chat.messages.length - 1];

    if (!lastMessage) {
      throw new Error('Cannot remove assistant response from empty chat');
    }

    if (lastMessage.role !== 'assistant') {
      throw new Error('Last message is not an assistant message');
    }

    this.setMessages({ id, messages: chat.messages.slice(0, -1) });
    this.resetActiveResponse(id);
  }

  private emitEvent({ id, event }: { id: string; event: ChatStoreEvent }) {
    const subscribers = this.subscribers.get(id);
    if (!subscribers) return;

    for (const subscriber of subscribers) {
      subscriber.onChatChanged(event);
    }
  }

  private calculateStep(id: string) {
    const chat = this.chats.get(id);
    if (!chat) return 0;

    if (
      !chat.activeResponse ||
      chat.activeResponse.message.role !== 'assistant'
    ) {
      return 0;
    }

    const hasToolInvocation = chat.activeResponse.message.parts?.some(
      part => part.type === 'tool-invocation',
    );

    if (!hasToolInvocation) {
      return 0;
    }

    return (
      (chat.activeResponse.message.parts?.reduce((max, part) => {
        if (part.type === 'tool-invocation') {
          return Math.max(max, part.toolInvocation.step ?? 0) ?? 0;
        }
        return max;
      }, 0) ?? 0) + 1
    );
  }

  private resetActiveResponse(id: string) {
    const chat = this.chats.get(id);
    if (!chat || !chat.activeResponse) return;

    chat.activeResponse = undefined;
    chat.error = undefined;
    chat.status = 'ready';
    this.emitEvent({ id, event: ChatStoreEvent.ChatStatusChanged });
    this.emitEvent({ id, event: ChatStoreEvent.ChatErrorChanged });
  }

  /**
   * Initializes the active response for a chat.
   * If the last message is an assistant message, it will be used to construct the active response state.
   * Otherwise, a new message will be created.
   */
  private initializeActiveResponse({
    chatId,
    messageId,
    generateId,
  }: {
    chatId: string;
    messageId?: string;
    generateId: () => string;
  }) {
    const chat = this.chats.get(chatId);
    if (!chat) return;

    const maybeLastAssistantMessage = this.getLastMessage(chatId);
    const lastMessage =
      maybeLastAssistantMessage?.role === 'assistant'
        ? maybeLastAssistantMessage
        : undefined;

    if (!lastMessage && maybeLastAssistantMessage?.role !== 'user') {
      throw new Error('Corresponding user message not found');
    }

    const id = messageId ?? lastMessage?.id ?? generateId();
    const createdAt = lastMessage?.createdAt ?? this.getCurrentDate();
    const parts = lastMessage?.parts ?? [];

    chat.activeResponse = {
      message: {
        id,
        createdAt,
        role: 'assistant',
        parts,
      },
      partialState: {
        textPart: parts.find(part => part.type === 'text'),
        reasoningPart: parts.find(part => part.type === 'reasoning'),
        toolParts: parts
          .filter(part => part.type === 'tool-invocation')
          .reduce(
            (acc, part) => {
              acc[part.toolInvocation.toolCallId] = part;
              return acc;
            },
            {} as Record<string, ToolInvocationUIPart>,
          ),
      },
    };
    chat.messages.push(chat.activeResponse!.message);
  }

  async addOrUpdateAssistantMessageParts({
    chatId,
    partDelta,
    messageId,
    generateId,
  }: {
    chatId: string;
    partDelta: UIMessage['parts'][number];
    messageId?: string;
    generateId: () => string;
  }) {
    const chat = this.chats.get(chatId);
    if (!chat) return;

    if (!chat.activeResponse) {
      this.initializeActiveResponse({
        chatId,
        messageId,
        generateId,
      });
    }

    const activeResponse = chat.activeResponse!;

    switch (partDelta.type) {
      // Parts that are updated in place:
      case 'text': {
        if (activeResponse.partialState.textPart) {
          activeResponse.partialState.textPart.text += partDelta.text;
        } else {
          activeResponse.partialState.textPart = { ...partDelta };
          activeResponse.message.parts.push(
            activeResponse.partialState.textPart,
          );
        }
        break;
      }
      case 'reasoning': {
        this.addOrUpdateReasoning({
          reasoning: partDelta,
          activeResponse,
        });
        break;
      }
      case 'tool-invocation': {
        await this.addOrUpdateToolInvocation({
          toolInvocation: partDelta.toolInvocation,
          activeResponse,
          chatId,
        });
        break;
      }
      // Parts that are just appended to parts array:
      case 'step-start':
      case 'source':
      case 'file': {
        activeResponse.message.parts.push(partDelta);
        break;
      }
      default: {
        throw new Error('Invalid message part type');
      }
    }

    chat.activeResponse!.message.revisionId = generateId();
    chat.messages = [...chat.messages];
    this.emitEvent({ id: chatId, event: ChatStoreEvent.ChatMessagesChanged });
  }

  updateActiveResponse({
    chatId,
    message,
    generateId,
  }: {
    chatId: string;
    message: Partial<UIMessage>;
    generateId: () => string;
  }) {
    const chat = this.chats.get(chatId);
    if (!chat) return;

    if (!chat.activeResponse) {
      this.initializeActiveResponse({
        chatId,
        messageId: message.id,
        generateId,
      });
    }

    chat.activeResponse!.message = {
      ...chat.activeResponse!.message,
      ...message,
    };

    this.setMessages({
      id: chatId,
      messages: [...chat.messages.slice(0, -1), chat.activeResponse!.message],
    });
  }

  clearStepPartialState({
    id,
    isContinued = false,
  }: {
    id: string;
    isContinued?: boolean;
  }) {
    const chat = this.chats.get(id);
    if (!chat || !chat.activeResponse) return;

    const partialState = {
      toolParts: chat.activeResponse?.partialState?.toolParts,
      reasoningPart: undefined,
      textPart: isContinued
        ? chat.activeResponse?.partialState?.textPart
        : undefined,
    };

    chat.activeResponse.partialState = partialState;
  }

  private async addOrUpdateToolInvocation({
    chatId,
    toolInvocation,
    activeResponse,
  }: {
    chatId: string;
    toolInvocation: ToolInvocation;
    activeResponse: ChatState['activeResponse'];
  }) {
    if (!activeResponse) return;

    const { toolCallId } = toolInvocation;
    const { message, partialState } = activeResponse;

    if (!partialState.toolParts) partialState.toolParts = {};

    const existingToolPart = partialState.toolParts[toolCallId] || {};
    const existingToolInvocation = existingToolPart?.toolInvocation;

    if (existingToolInvocation) {
      existingToolInvocation.state = toolInvocation.state;

      switch (toolInvocation.state) {
        case 'partial-call': {
          const args = existingToolInvocation.args + toolInvocation.args;
          const { value: partialArgs, state } = await parsePartialJson(args);
          existingToolInvocation.args =
            state === 'successful-parse' ? partialArgs : args;
          break;
        }
        case 'call': {
          existingToolInvocation.args = toolInvocation.args;
          break;
        }
        case 'result': {
          // @ts-ignore - caused by `result` not existing on ToolCall type
          existingToolInvocation.result = toolInvocation.result;
          break;
        }
        default: {
          throw new Error('Invalid tool invocation state');
        }
      }
    } else {
      if (toolInvocation.state === 'result') {
        throw new Error('tool_result must be preceded by a tool_call');
      }

      if (
        toolInvocation.state !== 'partial-call' &&
        toolInvocation.state !== 'call'
      ) {
        throw new Error('Invalid tool invocation state');
      }

      const partialToolPart: ToolInvocationUIPart = {
        type: 'tool-invocation',
        toolInvocation: {
          args: toolInvocation.args ?? '',
          step: this.calculateStep(chatId),
          toolName: toolInvocation.toolName,
          state: toolInvocation.state,
          toolCallId,
        } as ToolInvocation,
      };

      partialState.toolParts[toolCallId] = partialToolPart;
      message.parts.push(partialToolPart);
    }
  }

  private addOrUpdateReasoning({
    reasoning,
    activeResponse,
  }: {
    reasoning: ReasoningUIPart;
    activeResponse: ChatState['activeResponse'];
  }) {
    if (!activeResponse) return;

    const partialReasoning = activeResponse.partialState.reasoningPart;

    const { text: reasoningTextDelta, providerMetadata } = reasoning;

    const isFinishedPart =
      partialReasoning &&
      reasoningTextDelta === '' &&
      providerMetadata === undefined;

    // Clear temporary state on `reasoning_part_finish`:
    if (isFinishedPart) {
      activeResponse.partialState.reasoningPart = undefined;
      return;
    }

    if (partialReasoning) {
      partialReasoning.text += reasoningTextDelta;
    } else {
      activeResponse.partialState.reasoningPart = {
        type: 'reasoning',
        text: reasoningTextDelta,
      };
      activeResponse.message.parts.push(
        activeResponse.partialState.reasoningPart,
      );
    }

    // Only update provider metadata if defined in the reasoning part:
    if (providerMetadata) {
      activeResponse.partialState.reasoningPart!.providerMetadata =
        providerMetadata;
    }
  }

  clear(id?: string) {
    if (id) {
      this.setMessages({ id, messages: [] });
      this.resetActiveResponse(id);
    } else {
      const ids = Array.from(this.chats.keys());
      for (const id of ids) {
        this.clear(id);
      }
    }
  }
}
