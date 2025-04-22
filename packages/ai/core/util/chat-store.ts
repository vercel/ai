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

enum ChatStoreEvent {
  ChatMessagesChanged = 'chat-messages-changed',
  ChatStatusChanged = 'chat-status-changed',
  ChatErrorChanged = 'chat-error-changed',
}

const ChatStoreEventMap = {
  [ChatStoreEvent.ChatMessagesChanged]: 'onChatMessagesChanged',
  [ChatStoreEvent.ChatStatusChanged]: 'onChatStatusChanged',
  [ChatStoreEvent.ChatErrorChanged]: 'onChatErrorChanged',
} as const;

interface ChatStoreInitialization {
  chats?: Record<string, Pick<ChatState, 'messages'>>;
}

interface ChatState {
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

  /**
   * Transient stream state for in-progress LLM responses:
   */
  // private step: number;
  // private partialToolCalls: Record<
  //   string,
  //   { text: string; step: number; index: number; toolName: string }
  // > = {};
  // private tempParts: {
  //   text?: TextUIPart;
  //   reasoning?: ReasoningUIPart;
  //   reasoningTextDetail?: { type: 'text'; text: string; signature?: string };
  // } = {};

  constructor({ chats = {} }: ChatStoreInitialization = {}) {
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
  }

  private emitEvent({ id, event }: { id: string; event: ChatStoreEvent }) {
    for (const subscriber of this.subscribers) {
      const handler = ChatStoreEventMap[event];
      subscriber[handler](id);
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

    if (chat.messages[chat.messages.length - 1].role !== 'assistant') {
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
    customGenerateId,
  }: {
    chatId: string;
    messageId?: string;
    customGenerateId?: () => string;
  }) {
    const chat = this.chats.get(chatId);
    if (!chat) return;

    chat.activeResponse = {
      message: {
        id: messageId ?? generateId(),
        createdAt: new Date(),
        role: 'assistant',
        content: '',
        parts: [],
      },
      partialState: {},
    };
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

  resetTempParts({ isContinued = false }: { isContinued?: boolean } = {}) {
    if (isContinued) {
      this.tempParts.reasoning = undefined;
      this.tempParts.reasoningTextDetail = undefined;
    } else {
      this.tempParts = {};
    }
  }

  private resetAllTempState() {
    this.resetTempParts();
    this.step = 0;
    this.partialToolCalls = {};
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

    if (message.toolInvocations == null) message.toolInvocations = [];
    if (!partialState.tools) partialState.tools = {};

    const existingCall = partialState.tools[toolCallId];

    if (existingCall) {
      let updatedInvocation: ToolInvocation | undefined;

      switch (toolInvocation.state) {
        case 'partial-call': {
          existingPartialToolInvocation.text += toolInvocation.args;
          const { value: partialArgs } = parsePartialJson(
            existingPartialToolInvocation.text,
          );
          updatedInvocation = {
            state: 'partial-call',
            step,
            toolCallId: toolInvocation.toolCallId,
            toolName: existingPartialToolInvocation.toolName,
            args: partialArgs,
          };
          break;
        }
        case 'call': {
          existingPartialToolInvocation.text = toolInvocation.args;
          updatedInvocation = {
            state: toolInvocation.state,
            step,
            toolCallId: toolInvocation.toolCallId,
            toolName: existingPartialToolInvocation.toolName,
            args: toolInvocation.args,
          };
          break;
        }
        case 'result': {
          updatedInvocation = {
            state: 'result',
            step,
            toolCallId: toolInvocation.toolCallId,
            toolName: existingPartialToolInvocation.toolName,
            args: existingPartialToolInvocation.text,
            result: toolInvocation.result,
          };
          break;
        }
        default: {
          throw new Error('Invalid tool invocation state');
        }
      }

      if (updatedInvocation) {
        // Update legacy state:
        assistantMessage.toolInvocations[existingPartialToolInvocation.index] =
          updatedInvocation;

        // Update existing part:
        const existingPart = assistantMessage.parts.find(
          part =>
            part.type === 'tool-invocation' &&
            part.toolInvocation.toolCallId === toolInvocation.toolCallId,
        ) as ToolInvocationUIPart;

        if (existingPart) {
          existingPart.toolInvocation = updatedInvocation;
        }
      }
    } else {
      switch (toolInvocation.state) {
        case 'result': {
          throw new Error('tool_result must be preceded by a tool_call');
        }
        case 'call': {
          this.partialToolCalls[toolInvocation.toolCallId] = {
            text: toolInvocation.args,
            step,
            toolName: toolInvocation.toolName,
            index: assistantMessage.toolInvocations.length,
          };
          break;
        }
        case 'partial-call': {
          this.partialToolCalls[toolInvocation.toolCallId] = {
            text: toolInvocation.args ?? '',
            step,
            toolName: toolInvocation.toolName,
            index: assistantMessage.toolInvocations.length,
          };
          break;
        }
        default: {
          throw new Error('Invalid tool invocation state');
        }
      }

      const withStep = { ...toolInvocation, step };

      // Update legacy state:
      assistantMessage.toolInvocations.push(withStep);

      // Push new tool invocation part:
      assistantMessage.parts.push({
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

  clear() {
    this.resetAllTempState();
    this.messages = [];
    this.notify('chat-messages-changed');
  }
}
