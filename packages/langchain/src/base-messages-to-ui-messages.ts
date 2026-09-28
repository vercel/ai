import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import type { DynamicToolUIPart, UIMessage } from 'ai';

let messageSequence = 0;

function nextMessageId(prefix: string): string {
  messageSequence += 1;
  return `${prefix}-${messageSequence}`;
}

function messageId(message: BaseMessage, prefix: string): string {
  return message.id ?? nextMessageId(prefix);
}

function textContent(content: BaseMessage['content']): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(block =>
        typeof block === 'string'
          ? block
          : typeof block === 'object' &&
              block !== null &&
              'type' in block &&
              block.type === 'text' &&
              'text' in block
            ? String(block.text)
            : '',
      )
      .join('');
  }
  return String(content ?? '');
}

/**
 * Converts LangChain `BaseMessage[]` back to AI SDK `UIMessage[]`.
 *
 * This is the reverse of `toBaseMessages()`: it restores a thread (e.g. from
 * `agent.getState()` on a LangGraph checkpointer) into `UIMessage[]` for
 * `useChat`'s `initialMessages`. `ToolMessage`s are correlated back to their
 * assistant message via `tool_call_id`.
 *
 * Pure mapping, no network calls.
 *
 * Closes https://github.com/vercel/ai/issues/12680
 */
export function baseMessagesToUIMessages(
  messages: BaseMessage[],
): UIMessage[] {
  const uiMessages: UIMessage[] = [];
  const assistantByToolCallId = new Map<string, string>();

  for (const message of messages) {
    if (message instanceof HumanMessage) {
      uiMessages.push({
        id: messageId(message, 'user'),
        role: 'user',
        parts: [{ type: 'text', text: textContent(message.content) }],
      });
      continue;
    }

    if (message instanceof SystemMessage) {
      uiMessages.push({
        id: messageId(message, 'system'),
        role: 'system',
        parts: [{ type: 'text', text: textContent(message.content) }],
      });
      continue;
    }

    if (message instanceof AIMessage) {
      const id = messageId(message, 'assistant');
      const parts: UIMessage['parts'] = [];
      const text = textContent(message.content);
      if (text) {
        parts.push({ type: 'text', text });
      }
      for (const toolCall of message.tool_calls ?? []) {
        const toolCallId = toolCall.id ?? nextMessageId('tool-call');
        assistantByToolCallId.set(toolCallId, id);
        parts.push({
          type: 'dynamic-tool',
          toolName: toolCall.name,
          toolCallId,
          state: 'input-available',
          input: toolCall.args,
        } satisfies DynamicToolUIPart);
      }
      uiMessages.push({ id, role: 'assistant', parts });
      continue;
    }

    if (message instanceof ToolMessage) {
      const output = textContent(message.content);
      const parentId = assistantByToolCallId.get(message.tool_call_id);
      const parent =
        parentId != null
          ? uiMessages.find(candidate => candidate.id === parentId)
          : uiMessages
              .filter(candidate => candidate.role === 'assistant')
              .at(-1);
      // One tool call is one part: upgrade the matching input-available part
      // to output-available so replay emits a single tool-call model message.
      const existingIndex =
        parent?.parts.findIndex(
          part =>
            part.type === 'dynamic-tool' &&
            part.toolCallId === message.tool_call_id &&
            part.state === 'input-available',
        ) ?? -1;
      if (parent != null && existingIndex >= 0) {
        const existing = parent.parts[existingIndex] as DynamicToolUIPart;
        parent.parts[existingIndex] = {
          ...existing,
          state: 'output-available',
          output,
        } as DynamicToolUIPart;
      } else {
        const outputPart = {
          type: 'dynamic-tool',
          toolName: message.name ?? 'tool',
          toolCallId: message.tool_call_id,
          state: 'output-available',
          input: {},
          output,
        } satisfies DynamicToolUIPart;
        if (parent != null) {
          parent.parts.push(outputPart);
        } else {
          uiMessages.push({
            id: messageId(message, 'tool'),
            role: 'assistant',
            parts: [outputPart],
          });
        }
      }
      continue;
    }

    // Unknown message types degrade to an assistant text message so no
    // history is silently dropped.
    uiMessages.push({
      id: messageId(message, 'unknown'),
      role: 'assistant',
      parts: [{ type: 'text', text: textContent(message.content) }],
    });
  }

  return uiMessages;
}

/**
 * Converts a LangGraph state snapshot (e.g. from `agent.getState()`) to
 * `UIMessage[]` for `useChat`'s `initialMessages`.
 *
 * Reads `snapshot.values.messages`. Pending `snapshot.interrupts` have no
 * `UIMessage` representation and are left for the caller to inspect on the
 * snapshot itself.
 */
export function stateSnapshotToUIMessages(snapshot: {
  values?: { messages?: BaseMessage[] };
}): UIMessage[] {
  return baseMessagesToUIMessages(snapshot?.values?.messages ?? []);
}
