import type {
  LanguageModelV4Prompt,
  LanguageModelV4ToolResult,
} from '@ai-sdk/provider';
import {
  lazySchema,
  safeValidateTypes,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type {
  AnthropicAssistantMessage,
  AnthropicPrompt,
} from './anthropic-api';

const toolResultPositionSchema = lazySchema(() =>
  zodSchema(
    z.object({
      messageOffset: z.number().int().nonnegative(),
      blockIndex: z.number().int().nonnegative(),
      previousMessageBlockCount: z.number().int().nonnegative(),
    }),
  ),
);
type ToolResultPosition = InferSchema<typeof toolResultPositionSchema>;
type Messages = AnthropicPrompt['messages'];
type ResultMove = {
  messageIndex: number;
  position: ToolResultPosition;
  result: AnthropicAssistantMessage['content'][number];
};

function findToolCallMessage(messages: Messages, toolCallId: string) {
  return messages.findIndex(
    message =>
      message.role === 'assistant' &&
      message.content.some(
        part => part.type === 'server_tool_use' && part.id === toolCallId,
      ),
  );
}

export function withAnthropicToolResultPosition(
  result: LanguageModelV4ToolResult,
  messages: Messages,
  blockIndex: number,
): LanguageModelV4ToolResult {
  const callMessageIndex = findToolCallMessage(messages, result.toolCallId);
  // Only results for calls in the request need a replay position.
  if (callMessageIndex === -1) return result;

  const lastMessage = messages.at(-1);
  const hasAssistantPrefill = lastMessage?.role === 'assistant';
  const responseMessageIndex = messages.length - (hasAssistantPrefill ? 1 : 0);
  const toolResultPosition: ToolResultPosition = {
    // An offset from the call survives removal of earlier conversation turns.
    messageOffset: responseMessageIndex - callMessageIndex,
    // A prefill and its response share one assistant message on replay.
    blockIndex:
      blockIndex + (hasAssistantPrefill ? lastMessage.content.length : 0),
    // A result-only response may disappear from UI replay. This boundary lets
    // us separate the preceding tool results from a following user message.
    previousMessageBlockCount:
      messages[responseMessageIndex - 1]?.content.length ?? 0,
  };
  return {
    ...result,
    providerMetadata: {
      ...result.providerMetadata,
      anthropic: { ...result.providerMetadata?.anthropic, toolResultPosition },
    },
  };
}

async function readToolResultPositions(prompt: LanguageModelV4Prompt) {
  const positions = new Map<string, ToolResultPosition>();
  for (const message of prompt) {
    if (message.role !== 'assistant') continue;
    for (const part of message.content) {
      if (part.type !== 'tool-result') continue;
      const value = part.providerOptions?.anthropic?.toolResultPosition;
      if (value == null) continue;
      const position = await safeValidateTypes({
        value,
        schema: toolResultPositionSchema,
      });
      if (position.success) positions.set(part.toolCallId, position.value);
    }
  }
  return positions;
}

function takeToolResults(
  messages: Messages,
  positions: Map<string, ToolResultPosition>,
) {
  const moves: ResultMove[] = [];
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    message.content = message.content.filter(result => {
      if (!('tool_use_id' in result)) return true;
      const position = positions.get(result.tool_use_id);
      if (position == null) return true;
      const callMessageIndex = findToolCallMessage(
        messages,
        result.tool_use_id,
      );
      const messageIndex = callMessageIndex + position.messageOffset;
      // Pruned calls and stale offsets cannot identify a destination.
      if (callMessageIndex === -1 || messageIndex > messages.length)
        return true;
      moves.push({ messageIndex, position, result });
      return false;
    });
  }
  return moves;
}

function getResultMessage(
  messages: Messages,
  messageIndex: number,
  previousBlockCount: number,
): AnthropicAssistantMessage {
  const previous = messages[messageIndex - 1];
  // With a result-only response omitted, conversion merges the tool results
  // and the next user message. Split them at the recorded request boundary.
  if (
    previous?.role === 'user' &&
    previous.content.length > previousBlockCount
  ) {
    const resultMessage: AnthropicAssistantMessage = {
      role: 'assistant',
      content: [],
    };
    const followingContent = previous.content.splice(previousBlockCount);
    messages.splice(messageIndex, 0, resultMessage, {
      role: 'user',
      content: followingContent,
    });
    return resultMessage;
  }
  const existing = messages[messageIndex];
  if (existing?.role === 'assistant') return existing;
  const resultMessage: AnthropicAssistantMessage = {
    role: 'assistant',
    content: [],
  };
  messages.splice(messageIndex, 0, resultMessage);
  return resultMessage;
}

/**
 * UI messages store each tool call and result together at the call's position.
 * Restore Anthropic's response order so replay preserves the cached prompt prefix.
 */
export async function restoreAnthropicToolResultPositions(
  messages: Messages,
  prompt: LanguageModelV4Prompt,
) {
  const positions = await readToolResultPositions(prompt);
  if (positions.size === 0) return;
  // Remove all results first so their displaced locations do not affect insertion.
  const moves = takeToolResults(messages, positions);
  // Work backwards through messages to keep indices stable when inserting a
  // missing message. Within each message, restore results in their original order.
  moves.sort(
    (a, b) =>
      b.messageIndex - a.messageIndex ||
      a.position.blockIndex - b.position.blockIndex,
  );
  for (const { messageIndex, position, result } of moves) {
    const target = getResultMessage(
      messages,
      messageIndex,
      position.previousMessageBlockCount,
    );
    target.content.splice(position.blockIndex, 0, result);
  }
}
