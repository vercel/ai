import type { ModelMessage } from '@ai-sdk/provider-utils';
import { validateCheckpoint } from '../compact-messages/validate-compaction';
import { InvalidArgumentError } from '../error/invalid-argument-error';
import { MessageConversionError } from '../prompt/message-conversion-error';
import {
  compactionUIPartSchema,
  deserializeCompactionMessages,
  getUIMessageCompactionDigest,
} from './ui-message-compaction';
import {
  isToolUIPart,
  type CompactionUIPart,
  type UIMessage,
} from './ui-messages';

/** Select a replacement only while the exact UI prefix it covers still exists. */
export async function resolveUIMessageCompaction<UI_MESSAGE extends UIMessage>(
  messages: Array<Omit<UI_MESSAGE, 'id'>>,
  options?: { ignoreIncompleteToolCalls?: boolean },
): Promise<{
  context: ModelMessage[];
  messages: Array<Omit<UI_MESSAGE, 'id'>>;
  appliedCompaction?: CompactionUIPart;
}> {
  for (
    let messageIndex = messages.length - 1;
    messageIndex >= 0;
    messageIndex--
  ) {
    const message = messages[messageIndex];

    for (
      let partIndex = message.parts.length - 1;
      partIndex >= 0;
      partIndex--
    ) {
      const part = message.parts[partIndex];
      if (part.type !== 'compaction') continue;

      const parsed = compactionUIPartSchema.safeParse(part);
      if (message.role !== 'assistant' || !parsed.success) {
        throw new MessageConversionError({
          originalMessage: message,
          message: 'Invalid UI message compaction record.',
        });
      }

      const { replaces } = parsed.data;
      const boundaryIndex = replaces.messageCount - 1;
      const boundary = messages[boundaryIndex];
      if (
        boundary == null ||
        boundaryIndex > messageIndex ||
        (boundaryIndex === messageIndex && replaces.partCount > partIndex) ||
        (boundary as { id?: string }).id !== replaces.messageId ||
        replaces.partCount > boundary.parts.length
      ) {
        continue;
      }

      const prefix = [
        ...messages.slice(0, boundaryIndex),
        { ...boundary, parts: boundary.parts.slice(0, replaces.partCount) },
      ];
      let digest: string;
      try {
        digest = await getUIMessageCompactionDigest(prefix);
      } catch (error) {
        if (InvalidArgumentError.isInstance(error)) continue;
        throw error;
      }
      if (digest !== replaces.digest) {
        continue;
      }

      let context: ModelMessage[];
      try {
        context = await deserializeCompactionMessages(parsed.data.messages);
        await validateCheckpoint(context, parsed.data.checkpoint);
      } catch {
        throw new MessageConversionError({
          originalMessage: message,
          message:
            'Invalid replacement model messages in UI compaction record.',
        });
      }

      // A boundary can fall within an assistant message, between model steps.
      // Keep every later part, including parts before the record itself.
      const remainingParts = boundary.parts.slice(replaces.partCount);
      const remainingMessages = [
        ...(remainingParts.length > 0
          ? [{ ...boundary, parts: remainingParts }]
          : []),
        ...messages.slice(boundaryIndex + 1),
      ];

      const replacementToolCalls = new Set<string>();
      const pendingToolCalls = new Set<string>();
      for (const contextMessage of context) {
        if (typeof contextMessage.content === 'string') continue;
        for (const contextPart of contextMessage.content) {
          if (contextPart.type === 'tool-call') {
            replacementToolCalls.add(contextPart.toolCallId);
            pendingToolCalls.add(contextPart.toolCallId);
          } else if (contextPart.type === 'tool-result') {
            pendingToolCalls.delete(contextPart.toolCallId);
          }
        }
      }

      // Filtering UI tool parts must also affect calls retained in a compacted
      // prefix. Fall back to visible history so the existing converter can apply
      // approval supersession and incomplete-call filtering without rewriting
      // opaque replacement context. Include provider-executed calls here.
      if (
        (pendingToolCalls.size > 0 &&
          (options?.ignoreIncompleteToolCalls ||
            remainingMessages.some(message => message.role === 'user'))) ||
        (options?.ignoreIncompleteToolCalls &&
          prefix.some(message =>
            message.parts.some(
              part =>
                isToolUIPart(part) &&
                replacementToolCalls.has(part.toolCallId) &&
                part.state !== 'approval-responded' &&
                part.state !== 'output-error' &&
                part.state !== 'output-denied' &&
                (part.state !== 'output-available' ||
                  part.preliminary === true),
            ),
          ))
      ) {
        continue;
      }

      return {
        context,
        messages: remainingMessages,
        appliedCompaction: parsed.data,
      };
    }
  }

  return { context: [], messages };
}
