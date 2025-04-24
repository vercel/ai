import {
  generateId,
  generateId as generateIdFunction,
  parsePartialJson,
} from '.';
import type {
  ReasoningUIPart,
  TextUIPart,
  ToolInvocation,
  ToolInvocationUIPart,
  UIMessage,
} from '../types';

interface ChatStoreSubscriber {
  onChatMessagesChanged(id: string): void;
  onChatStatusChanged(id: string): void;
  onChatErrorChanged(id: string): void;
  // onChatAdded?
  // onChatRemoved?
}

export enum ChatStoreEvent {
  ChatMessagesChanged = 'chat-messages-changed',
  ChatStatusChanged = 'chat-status-changed',
  ChatErrorChanged = 'chat-error-changed',
  // ChatAdded = 'chat-added',
  // ChatRemoved = 'chat-removed',
}

const ChatStoreEventMap = {
  [ChatStoreEvent.ChatMessagesChanged]: 'onChatMessagesChanged',
  [ChatStoreEvent.ChatStatusChanged]: 'onChatStatusChanged',
  [ChatStoreEvent.ChatErrorChanged]: 'onChatErrorChanged',
} as const;

export interface ChatStoreInitialization {
  chats?: Record<string, Pick<ChatState, 'messages'>>;
  onChatStoreChange?: ({
    event,
    chatId,
    state,
  }: {
    event: ChatStoreEvent;
    chatId: string;
    state: ChatState;
  }) => void;
}

export interface ChatState {
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  messages: UIMessage[];
  step?: number;
  activeResponse?: {
    message: UIMessage;
    partialState: {
      textPart?: TextUIPart;
      reasoningPart?: ReasoningUIPart;
      reasoningTextDetail?: { type: 'text'; text: string; signature?: string };
      tools?: Record<
        string,
        { step: number; text: string; index: number; toolName: string }
      >;
    };
  };
  error?: Error;
}

export class ChatStore {
  private chats: Map<string, ChatState>;
  private subscribers: Set<ChatStoreSubscriber>;
  private onChatStoreChange?: ChatStoreInitialization['onChatStoreChange'];

  constructor({ chats = {}, onChatStoreChange }: ChatStoreInitialization = {}) {
    this.chats = new Map(
      Object.entries(chats).map(([id, state]) => [
        id,
        {
          messages: [...state.messages],
          status: 'ready',
          activeResponse: undefined,
          error: undefined,
          step: 0,
        },
      ]),
    );
    this.subscribers = new Set();
    this.onChatStoreChange = onChatStoreChange;
  }

  get totalChats() {
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

  private emitEvent({ id, event }: { id: string; event: ChatStoreEvent }) {
    for (const subscriber of this.subscribers) {
      const handler = ChatStoreEventMap[event];
      subscriber[handler](id);
    }

    if (this.onChatStoreChange) {
      const state = this.chats.get(id);
      if (state) {
        this.onChatStoreChange({
          event,
          chatId: id,
          state,
        });
      }
    }
  }

  subscribe(subscriber: ChatStoreSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  private getStep(id: string): number {
    const chat = this.chats.get(id);
    if (!chat) return 0;
    return chat.step ?? 0;
  }

  private resetActiveResponseState(id: string) {
    const chat = this.chats.get(id);
    if (!chat) return;

    chat.step = 0;
    chat.activeResponse = undefined;
    chat.error = undefined;
    chat.status = 'ready';
    this.emitEvent({ id, event: ChatStoreEvent.ChatStatusChanged });
    this.emitEvent({ id, event: ChatStoreEvent.ChatErrorChanged });
  }

  private calculateActiveResponseStep(id: string) {
    const chat = this.chats.get(id);
    if (!chat) return;

    const activeResponse = chat?.activeResponse;

    if (activeResponse?.role === 'assistant') {
      chat.step =
        activeResponse.parts?.reduce((max, part) => {
          if (part.type === 'tool-invocation') {
            return Math.max(max, part.toolInvocation.step ?? 0) ?? 0;
          }
          return max;
        }, 0) ?? 0;
    } else {
      chat.step = 0;
    }
  }

  incrementStep(id: string) {
    const chat = this.chats.get(id);
    if (!chat) return;
    chat.step = (chat.step ?? 0) + 1;
  }

  getMessages(id: string) {
    const chat = this.chats.get(id);
    if (!chat) return;
    return chat.activeResponse
      ? [...chat.messages, { ...chat.activeResponse.message }]
      : chat.messages;
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
    this.resetActiveResponseState(id);
  }

  setMessages({ id, messages }: { id: string; messages: UIMessage[] }) {
    const chat = this.chats.get(id);
    if (!chat) return;

    chat.messages = [...messages];
    this.calculateActiveResponseStep(id);
    this.emitEvent({ id, event: ChatStoreEvent.ChatMessagesChanged });
  }

  appendMessage({ id, message }: { id: string; message: UIMessage }) {
    const chat = this.chats.get(id);
    if (!chat) return;

    chat.messages = [...chat.messages, { ...message }];
    this.emitEvent({ id, event: ChatStoreEvent.ChatMessagesChanged });
  }

  private initializeActiveResponse({
    chatId,
    messageId,
    customGenerateId = generateId,
  }: {
    chatId: string;
    messageId?: string;
    customGenerateId?: () => string;
  }) {
    const chat = this.chats.get(chatId);
    if (!chat) return;

    chat.activeResponse = {
      message: {
        id: messageId ?? customGenerateId(),
        createdAt: new Date(),
        role: 'assistant',
        content: '',
        parts: [],
      },
      partialState: {},
    };
  }

  commitActiveResponse({ id }: { id: string }) {
    const chat = this.chats.get(id);
    if (!chat || !chat.activeResponse) return;

    const message = { ...chat.activeResponse.message };
    this.resetActiveResponseState(id);
    this.setMessages({
      id,
      messages: [...chat.messages, message],
    });
  }

  addOrUpdateAssistantMessageParts({
    chatId,
    generateId = generateIdFunction,
    partDelta,
    messageId,
  }: {
    chatId: string;
    partDelta: UIMessage['parts'][number];
    messageId?: string;
    generateId?: () => string;
  }) {
    const chat = this.chats.get(chatId);
    if (!chat) return;

    if (!chat.activeResponse) {
      const lastMessage = chat.messages[chat.messages.length - 1];
      if (lastMessage?.role !== 'user') {
        throw new Error('Invalid state: no corresponding user message found');
      }

      this.initializeActiveResponse({
        chatId,
        messageId,
        customGenerateId: generateId,
      });
    }

    const activeResponse = chat.activeResponse!;

    switch (partDelta.type) {
      // Parts that are updated in place:
      case 'text': {
        if (activeResponse.partialState.textPart) {
          activeResponse.partialState.textPart.text += partDelta.text;
        } else {
          activeResponse.partialState.textPart = partDelta;
          activeResponse.message.parts.push(partDelta);
        }
        activeResponse.message.content += partDelta.text;
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
        this.addOrUpdateToolInvocation({
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

    this.emitEvent({ id: chatId, event: ChatStoreEvent.ChatMessagesChanged });
  }

  resetTempParts({
    id,
    isContinued = false,
  }: {
    id: string;
    isContinued?: boolean;
  }) {
    const chat = this.chats.get(id);
    if (!chat) return;

    if (isContinued) {
      chat.activeResponse = {
        ...chat.activeResponse,
        partialState: {
          ...chat.activeResponse?.partialState,
          reasoningPart: undefined,
          reasoningTextDetail: undefined,
        },
      } as ChatState['activeResponse'];
    } else {
      chat.activeResponse = {
        ...chat.activeResponse,
        partialState: {},
      } as ChatState['activeResponse'];
    }
  }

  private addOrUpdateToolInvocation({
    chatId,
    toolInvocation,
    activeResponse,
  }: {
    chatId: string;
    toolInvocation: ToolInvocation;
    activeResponse: ChatState['activeResponse'];
  }) {
    if (!activeResponse) return;

    const step = this.getStep(chatId);
    const { toolCallId } = toolInvocation;
    const { message, partialState } = activeResponse;
    // Do we want a shallow copy of message and partialState? And at the end assign them back? W.r.t. how Solid works

    if (message.toolInvocations == null) message.toolInvocations = [];
    if (!partialState.tools) partialState.tools = {};

    const maybeExistingCallState = partialState.tools[toolCallId];
    const maybeExistingInvocation = message.toolInvocations.find(
      invocation => invocation.toolCallId === toolCallId,
    );
    const toolName =
      maybeExistingInvocation?.toolName ||
      maybeExistingCallState?.toolName ||
      toolInvocation.toolName;

    const updatedToolInvocation = {
      toolName,
      step,
      toolCallId,
      state: toolInvocation.state,
      args: maybeExistingInvocation?.args,
      result:
        maybeExistingInvocation && 'result' in maybeExistingInvocation
          ? maybeExistingInvocation.result
          : undefined,
    };

    if (maybeExistingCallState) {
      switch (toolInvocation.state) {
        case 'partial-call': {
          maybeExistingCallState.text += toolInvocation.args;
          const { value: partialArgs } = parsePartialJson(
            maybeExistingCallState.text,
          );
          updatedToolInvocation.args = partialArgs;
          break;
        }
        case 'call': {
          // To validate: do either of these need to be parse/stringified?
          console.log('TOOL CALL:', typeof toolInvocation.args);
          maybeExistingCallState.text = toolInvocation.args;
          updatedToolInvocation.args = toolInvocation.args;
          break;
        }
        case 'result': {
          updatedToolInvocation.result = toolInvocation.result;
          break;
        }
        default: {
          throw new Error('Invalid tool invocation state');
        }
      }

      message.toolInvocations[maybeExistingCallState.index] =
        updatedToolInvocation;

      const existingPart = message.parts.find(
        part =>
          part.type === 'tool-invocation' &&
          part.toolInvocation.toolCallId === toolInvocation.toolCallId,
      ) as ToolInvocationUIPart;

      if (existingPart) {
        existingPart.toolInvocation = updatedToolInvocation;
      }
    } else {
      switch (toolInvocation.state) {
        case 'result': {
          throw new Error('tool_result must be preceded by a tool_call');
        }
        case 'call': {
          partialState.tools[toolInvocation.toolCallId] = {
            text: toolInvocation.args,
            step,
            toolName,
            index: message.toolInvocations.length,
          };
          break;
        }
        case 'partial-call': {
          partialState.tools[toolInvocation.toolCallId] = {
            text: toolInvocation.args ?? '',
            step,
            toolName,
            index: message.toolInvocations.length,
          };
          break;
        }
        default: {
          throw new Error('Invalid tool invocation state');
        }
      }

      const withStep = { ...toolInvocation, step };
      message.toolInvocations.push(withStep);
      message.parts.push({
        type: 'tool-invocation',
        toolInvocation: withStep,
      });
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

    const detail = reasoning.details[0];
    const isRedacted = detail?.type === 'redacted';
    const maybeSignature =
      detail?.type === 'text' && detail?.signature
        ? detail.signature
        : undefined;

    /**
     * First we handle Reasoning Text Detail:
     *
     * 1. Reset if we received a redacted part
     * 2. Append/update if Reasoning Text Detail exists
     * 3. Initialize if reasoning text detail is undefined
     * 4. Only push the detail if parent reasoning part exists
     */
    if (isRedacted) {
      activeResponse.partialState.reasoningTextDetail = undefined;
    }

    const { reasoningTextDetail, reasoningPart } = activeResponse.partialState;

    if (reasoningTextDetail) {
      reasoningTextDetail.text += reasoning.reasoning;
      if (maybeSignature) reasoningTextDetail.signature = maybeSignature;
    } else {
      activeResponse.partialState.reasoningTextDetail = {
        type: 'text',
        text: reasoning.reasoning,
        signature: maybeSignature,
      };

      if (reasoningPart) {
        reasoningPart.details.push(
          activeResponse.partialState.reasoningTextDetail,
        );
      }
    }

    /**
     * Then, we handle the Reasoning Part:
     * 1. If Reasoning Part exists, append reasoning text
     * 2. Otherwise, we initialize the entire reasoning part
     */
    if (reasoningPart) {
      reasoningPart.reasoning += reasoning.reasoning;
    } else {
      activeResponse.partialState.reasoningPart = {
        type: 'reasoning',
        reasoning: reasoning.reasoning,
        details: reasoningTextDetail ? [reasoningTextDetail] : [],
      };
      activeResponse.message.parts.push(
        activeResponse.partialState.reasoningPart,
      );
    }

    if (isRedacted) {
      activeResponse.partialState.reasoningPart?.details.push(detail);
    }

    activeResponse.message.reasoning =
      (activeResponse.message.reasoning ?? '') + reasoning.reasoning;
  }

  clear(id?: string) {
    if (id) {
      this.chats.set(id, {
        messages: [],
        status: 'ready',
        activeResponse: undefined,
        error: undefined,
        step: 0,
      });
      this.emitEvent({ id, event: ChatStoreEvent.ChatMessagesChanged });
      this.emitEvent({ id, event: ChatStoreEvent.ChatStatusChanged });
      this.emitEvent({ id, event: ChatStoreEvent.ChatErrorChanged });
    } else {
      const ids = Array.from(this.chats.keys());
      for (const id of ids) {
        this.clear(id);
      }
    }
  }
}
