import { generateId as generateIdFunction, parsePartialJson } from '.';
import type {
  ReasoningUIPart,
  TextUIPart,
  ToolInvocation,
  ToolInvocationUIPart,
  UIMessage,
} from '../types';

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

  addOrUpdateAssistantMessageParts({
    generateId = generateIdFunction,
    partDelta,
    step,
    id,
  }: {
    partDelta: UIMessage['parts'][number];
    step: number;
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
        // onRedactedReasoningPart we reset the reasoningTextDetail:
        if (partDelta.details[0].type === 'redacted') {
          this.tempParts.reasoningTextDetail = undefined;
        } // onReasoningPart we append the reasoning to the reasoningTextDetail (if it exists):
        else if (this.tempParts.reasoningTextDetail) {
          this.tempParts.reasoningTextDetail.text += partDelta.reasoning;

          // And we update the signature on onReasoningSignaturePart:
          if (
            partDelta.details[0].type === 'text' &&
            partDelta.details[0].signature
          ) {
            this.tempParts.reasoningTextDetail.signature =
              partDelta.details[0].signature;
          }
        } // When reasonTextDetail is not set, we initialize:
        else {
          this.tempParts.reasoningTextDetail = {
            type: 'text',
            text: partDelta.reasoning,
          };
          if (this.tempParts.reasoning) {
            this.tempParts.reasoning.details.push(
              this.tempParts.reasoningTextDetail,
            );
          }
        }

        // If reasoning part exists, just append the reasoning text (since details have already been updated above):
        if (this.tempParts.reasoning) {
          this.tempParts.reasoning.reasoning += partDelta.reasoning;
        } // Otherwise, we initialize the entire reasoning part:
        else {
          this.tempParts.reasoning = {
            type: 'reasoning',
            reasoning: partDelta.reasoning,
            // reasonTextDetail can be undefined if we received a redacted reasoning part:
            details: this.tempParts.reasoningTextDetail
              ? [this.tempParts.reasoningTextDetail]
              : [],
          };
          assistantMessage.parts.push(this.tempParts.reasoning);
        }

        // If redacted, we push the redacted data to the details:
        if (partDelta.details[0].type === 'redacted') {
          this.tempParts.reasoning.details.push(partDelta.details[0]);
        }

        assistantMessage.reasoning =
          (assistantMessage.reasoning ?? '') + partDelta.reasoning;
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
    step,
  }: {
    toolInvocation: ToolInvocation;
    assistantMessage: UIMessage;
    step: number;
  }) {
    if (assistantMessage.toolInvocations == null) {
      assistantMessage.toolInvocations = [];
    }

    const existingToolInvocation =
      this.partialToolCalls[toolInvocation.toolCallId];

    if (existingToolInvocation) {
      let updatedInvocation: ToolInvocation | undefined;

      switch (toolInvocation.state) {
        case 'partial-call': {
          existingToolInvocation.text += toolInvocation.args;
          const { value: partialArgs } = parsePartialJson(toolInvocation.args);
          updatedInvocation = {
            state: 'partial-call',
            step,
            toolCallId: toolInvocation.toolCallId,
            toolName: existingToolInvocation.toolName,
            args: partialArgs,
          };
          break;
        }
        case 'call': {
          updatedInvocation = {
            state: toolInvocation.state,
            step,
            toolCallId: toolInvocation.toolCallId,
            toolName: existingToolInvocation.toolName,
            args: toolInvocation.args,
          };
          delete this.partialToolCalls[toolInvocation.toolCallId];
          break;
        }
        case 'result': {
          existingToolInvocation.text += toolInvocation.args;
          const { value: args } = parsePartialJson(toolInvocation.args);
          updatedInvocation = {
            state: toolInvocation.state,
            step,
            toolCallId: toolInvocation.toolCallId,
            toolName: existingToolInvocation.toolName,
            args,
            result: toolInvocation.result,
          };
          delete this.partialToolCalls[toolInvocation.toolCallId];
          break;
        }
        default: {
          throw new Error('Invalid tool invocation state');
        }
      }

      if (updatedInvocation) {
        // Update legacy state:
        assistantMessage.toolInvocations[existingToolInvocation.index] =
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
        case 'partial-call': {
          this.partialToolCalls[toolInvocation.toolCallId] = {
            text: toolInvocation.args,
            step,
            toolName: toolInvocation.toolName,
            index: assistantMessage.toolInvocations.length,
          };
          break;
        }
        case 'call': {
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

  clear() {
    this.messages = [];
    this.notify();
  }
}
