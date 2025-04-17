import { generateId as generateIdFunction, parsePartialJson } from '.';
import type {
  ReasoningUIPart,
  TextUIPart,
  ToolInvocation,
  ToolInvocationUIPart,
  UIMessage,
} from '../types';
import { throttle } from './throttle';

type SubscriberCallback = () => void;

/**
 * Internal class for managing UIMessages
 */
export class MessagesStore {
  chatId: string;
  private messages: UIMessage[] = [];
  private subscribers: Set<SubscriberCallback>;
  private notify: () => void;

  // Temporary state for in-progress chat response:
  private partialToolCalls: Record<
    string,
    { text: string; step: number; index: number; toolName: string }
  > = {};
  private tempParts: {
    text?: TextUIPart;
    reasoning?: ReasoningUIPart;
    reasoningTextDetail?: { type: 'text'; text: string; signature?: string };
  } = {};

  constructor({
    chatId = generateIdFunction(),
    initialMessages,
    throttleMs,
  }: {
    initialMessages: UIMessage[];
    throttleMs?: number;
    chatId?: string;
  }) {
    this.messages = initialMessages;
    this.chatId = chatId;
    this.subscribers = new Set();
    this.notify = throttleMs
      ? throttle(() => this.emit(), throttleMs)
      : () => this.emit();
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

  addOrUpdateAssistantMessageParts({
    generateId = generateIdFunction,
    partDelta,
    step,
    id,
  }: {
    partDelta: UIMessage['parts'][number];
    step?: number;
    id?: string;
    generateId?: () => string;
  }) {
    const lastMessage = this.getLastMessage();
    if (!lastMessage) return;

    const isNewAssistantMessage = lastMessage.role === 'user';

    const assistantMessage: UIMessage = isNewAssistantMessage
      ? {
          id: id ?? generateId(),
          createdAt: new Date(),
          role: 'assistant',
          content: '',
          parts: [],
        }
      : lastMessage;

    switch (partDelta.type) {
      // Parts that are updated *in place*:
      case 'text': {
        if (this.tempParts.text) {
          this.tempParts.text.text += partDelta.text;
        } else {
          this.tempParts.text = partDelta;
          assistantMessage.parts.push(this.tempParts.text);
        }
        assistantMessage.content += partDelta.text;
        break;
      }
      case 'reasoning': {
        this.addOrUpdateReasoning({
          reasoning: partDelta,
          assistantMessage,
        });
        break;
      }
      case 'tool-invocation': {
        this.addOrUpdateToolInvocation({
          toolInvocation: partDelta.toolInvocation,
          assistantMessage,
          step,
        });
        break;
      }
      // Parts that are just appended to parts array:
      case 'step-start':
      case 'source':
      case 'file': {
        assistantMessage.parts.push(partDelta);
        break;
      }
      default: {
        throw new Error('Invalid part delta type');
      }
    }

    if (isNewAssistantMessage) {
      this.appendMessage(assistantMessage);
    } else {
      this.updateLastMessage(assistantMessage);
    }
  }

  resetTempParts({ isContinued = false }: { isContinued?: boolean }) {
    if (isContinued) {
      this.tempParts.reasoning = undefined;
      this.tempParts.reasoningTextDetail = undefined;
    } else {
      this.tempParts = {};
    }
  }

  private addOrUpdateToolInvocation({
    toolInvocation,
    assistantMessage,
    step: stepNumber,
  }: {
    toolInvocation: ToolInvocation;
    assistantMessage: UIMessage;
    step?: number;
  }) {
    if (assistantMessage.toolInvocations == null) {
      assistantMessage.toolInvocations = [];
    }

    const step =
      stepNumber ??
      1 +
        // find max step in existing tool invocations:
        (assistantMessage.toolInvocations?.reduce((max, toolInvocation) => {
          return Math.max(max, toolInvocation.step ?? 0);
        }, 0) ?? 0);

    const existingPartialToolInvocation =
      this.partialToolCalls[toolInvocation.toolCallId];

    if (existingPartialToolInvocation) {
      let updatedInvocation: ToolInvocation | undefined;

      switch (toolInvocation.state) {
        case 'partial-call': {
          existingPartialToolInvocation.text += toolInvocation.args;
          const { value: partialArgs } = parsePartialJson(toolInvocation.args);
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
            text: '',
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

      // Update legacy state:
      assistantMessage.toolInvocations.push(toolInvocation);

      // Push new tool invocation part:
      assistantMessage.parts.push({
        type: 'tool-invocation',
        toolInvocation,
      });
    }
  }

  private addOrUpdateReasoning({
    reasoning,
    assistantMessage,
  }: {
    reasoning: ReasoningUIPart;
    assistantMessage: UIMessage;
  }) {
    const detail = reasoning.details[0];

    // Reset text detail if sent redacted part:
    if (detail?.type === 'redacted') {
      this.tempParts.reasoningTextDetail = undefined;
    } // Append to existing reasoning text detail if exists:
    else if (this.tempParts.reasoningTextDetail) {
      this.tempParts.reasoningTextDetail.text += reasoning.reasoning;

      // Update the signature if sent:
      if (detail?.type === 'text' && detail?.signature) {
        this.tempParts.reasoningTextDetail.signature = detail.signature;
      }
    } // Initialize if reasoning text detail is undefined:
    else {
      this.tempParts.reasoningTextDetail = {
        type: 'text',
        text: reasoning.reasoning,
      };
      // Only push if reasoning part exists:
      if (this.tempParts.reasoning) {
        this.tempParts.reasoning.details.push(
          this.tempParts.reasoningTextDetail,
        );
      }
    }

    // If reasoning part exists, append reasoning text
    // (since inner text details array has been updated above):
    if (this.tempParts.reasoning) {
      this.tempParts.reasoning.reasoning += reasoning.reasoning;
    } // Otherwise, we initialize the entire reasoning part:
    else {
      this.tempParts.reasoning = {
        type: 'reasoning',
        reasoning: reasoning.reasoning,
        // detail may be undefined if we received a redacted reasoning part:
        details: this.tempParts.reasoningTextDetail
          ? [this.tempParts.reasoningTextDetail]
          : [],
      };
      assistantMessage.parts.push(this.tempParts.reasoning);
    }

    // If redacted, we push the redacted data to the details:
    if (detail?.type === 'redacted') {
      this.tempParts.reasoning.details.push(detail);
    }

    assistantMessage.reasoning =
      (assistantMessage.reasoning ?? '') + reasoning.reasoning;
  }

  clear() {
    this.messages = [];
    this.notify();
  }
}
