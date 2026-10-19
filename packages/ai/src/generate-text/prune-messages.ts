import type {
  AssistantModelMessage,
  ModelMessage,
  ToolModelMessage,
} from '@ai-sdk/provider-utils';

/**
 * Prunes model messages from a list of model messages.
 *
 * @param messages - The list of model messages to prune.
 * @param reasoning - How to remove reasoning content from assistant messages. Default is `'none'`.
 * @param toolCalls - How to prune tool call/results/approval content. Default is `[]`.
 * @param emptyMessages - Whether to keep or remove messages whose content is empty after pruning. Default is `'remove'`.
 *
 * @returns The pruned list of model messages.
 */
export function pruneMessages({
  messages,
  reasoning = 'none',
  toolCalls = [],
  emptyMessages = 'remove',
}: {
  messages: ModelMessage[];
  reasoning?: 'all' | 'before-last-message' | 'none';
  toolCalls?:
    | 'all'
    | 'before-last-message'
    | `before-last-${number}-messages`
    | 'none'
    | Array<{
        type: 'all' | 'before-last-message' | `before-last-${number}-messages`;
        tools?: string[];
      }>;
  emptyMessages?: 'keep' | 'remove';
}): ModelMessage[] {
  // filter reasoning parts:
  if (reasoning === 'all' || reasoning === 'before-last-message') {
    messages = messages.map((message, messageIndex) => {
      if (
        message.role !== 'assistant' ||
        typeof message.content === 'string' ||
        (reasoning === 'before-last-message' &&
          messageIndex === messages.length - 1)
      ) {
        return message;
      }

      return {
        ...message,
        content: message.content.filter(part => part.type !== 'reasoning'),
      };
    });
  }

  // filter tool calls, results, errors, and approvals:
  if (toolCalls === 'none') {
    toolCalls = [];
  } else if (toolCalls === 'all') {
    toolCalls = [{ type: 'all' }];
  } else if (toolCalls === 'before-last-message') {
    toolCalls = [{ type: 'before-last-message' }];
  } else if (typeof toolCalls === 'string') {
    toolCalls = [{ type: toolCalls }];
  }

  for (const toolCall of toolCalls) {
    // determine how many trailing messages to keep:
    const keepLastMessagesCount =
      toolCall.type === 'all'
        ? undefined
        : toolCall.type === 'before-last-message'
          ? 1
          : Number(
              toolCall.type
                .slice('before-last-'.length)
                .slice(0, -'-messages'.length),
            );

    // scan kept messages to identify tool calls and approvals that need to be kept:
    const keptToolCallIds: Set<string> = new Set();
    const keptApprovalIds: Set<string> = new Set();

    if (keepLastMessagesCount != null) {
      for (const message of messages.slice(-keepLastMessagesCount)) {
        if (
          (message.role === 'assistant' || message.role === 'tool') &&
          typeof message.content !== 'string'
        ) {
          for (const part of message.content) {
            if (part.type === 'tool-call' || part.type === 'tool-result') {
              keptToolCallIds.add(part.toolCallId);
            }
          }
        }
      }
    }

    messages = messages.map((message, messageIndex) => {
      if (
        (message.role !== 'assistant' && message.role !== 'tool') ||
        typeof message.content === 'string' ||
        (keepLastMessagesCount &&
          messageIndex >= messages.length - keepLastMessagesCount)
      ) {
        return message;
      }

<<<<<<< HEAD
      const toolCallIdToToolName: Record<string, string> = {};

      return {
        ...message,
        content: message.content.filter(part => {
          // keep non-tool parts:
          if (part.type !== 'tool-call' && part.type !== 'tool-result') {
            return true;
          }

          // track tool calls and approvals:
          if (part.type === 'tool-call') {
            toolCallIdToToolName[part.toolCallId] = part.toolName;
          }

          // keep parts that are associated with a tool call or approval that needs to be kept:
          if (
            (part.type === 'tool-call' || part.type === 'tool-result') &&
            keptToolCallIds.has(part.toolCallId)
          ) {
            return true;
          }

          // keep parts that are not associated with a tool that should be removed:
          return (
            toolCall.tools != null && !toolCall.tools.includes(part.toolName)
          );
        }),
=======
      const keepParts = message.content.map(part => {
        // keep non-tool parts:
        if (
          part.type !== 'tool-call' &&
          part.type !== 'tool-result' &&
          part.type !== 'tool-approval-request' &&
          part.type !== 'tool-approval-response'
        ) {
          return true;
        }

        // keep parts that are associated with a tool call or approval that needs to be kept:
        if (
          ((part.type === 'tool-call' || part.type === 'tool-result') &&
            keptToolCallIds.has(part.toolCallId)) ||
          ((part.type === 'tool-approval-request' ||
            part.type === 'tool-approval-response') &&
            keptApprovalIds.has(part.approvalId))
        ) {
          return true;
        }

        // keep parts that are not associated with a tool that should be removed:
        const partToolName =
          part.type === 'tool-call' || part.type === 'tool-result'
            ? part.toolName
            : approvalIdToToolName.get(part.approvalId);

        return (
          toolCall.tools != null &&
          partToolName != null &&
          !toolCall.tools.includes(partToolName)
        );
      });

      // Consecutive reasoning parts can belong to the same provider item.
      // Remove the whole group when its following content was pruned.
      if (message.role === 'assistant') {
        for (
          let reasoningIndex = 0;
          reasoningIndex < message.content.length;
          reasoningIndex++
        ) {
          const part = message.content[reasoningIndex];
          if (part.type !== 'reasoning' && part.type !== 'reasoning-file') {
            continue;
          }

          let reasoningEndIndex = reasoningIndex + 1;
          while (reasoningEndIndex < message.content.length) {
            const nextPart = message.content[reasoningEndIndex];
            if (
              nextPart.type !== 'reasoning' &&
              nextPart.type !== 'reasoning-file'
            ) {
              break;
            }
            reasoningEndIndex++;
          }

          let followingPartIndex = reasoningEndIndex;
          let hasFollowingPart = false;
          let hasKeptFollowingPart = false;

          while (followingPartIndex < message.content.length) {
            const followingPart = message.content[followingPartIndex];
            if (
              followingPart.type === 'reasoning' ||
              followingPart.type === 'reasoning-file'
            ) {
              break;
            }

            hasFollowingPart = true;
            hasKeptFollowingPart ||= keepParts[followingPartIndex];
            followingPartIndex++;
          }

          if (hasFollowingPart && !hasKeptFollowingPart) {
            for (
              let index = reasoningIndex;
              index < reasoningEndIndex;
              index++
            ) {
              keepParts[index] = false;
            }
          }

          reasoningIndex = followingPartIndex - 1;
        }
      }

      return {
        ...message,
        content: message.content.filter((_, index) => keepParts[index]),
>>>>>>> 3785b2e1c2 (fix: pruneMessages leaves orphaned reasoning after pruning associated tool calls (#23128))
      } as AssistantModelMessage | ToolModelMessage;
    });
  }

  if (emptyMessages === 'remove') {
    messages = messages.filter(message => message.content.length > 0);
  }

  return messages;
}
