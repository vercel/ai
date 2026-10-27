import type { ModelMessage } from '@ai-sdk/provider-utils';
import type { CompactionCheckpoint } from '../compact-messages/types';
import {
  createCheckpoint,
  validateCheckpoint,
} from '../compact-messages/validate-compaction';
import { InvalidArgumentError } from '../error/invalid-argument-error';
import {
  getUIMessageCompactionDigest,
  deserializeCompactionMessages,
  serializeCompactionMessages,
} from './ui-message-compaction';
import type { CompactionUIPart, UIMessage } from './ui-messages';

/**
 * Create a persistent UI message part that replaces this complete UI history
 * when converting it back to model messages. Write the returned part to a UI
 * message stream before generating the response from replacementMessages.
 */
export async function createUIMessageCompaction({
  messages,
  replacementMessages,
  checkpoint,
}: {
  messages: readonly UIMessage[];
  replacementMessages: readonly ModelMessage[];
  checkpoint?: CompactionCheckpoint;
}): Promise<CompactionUIPart> {
  const ids = new Set<string>();
  if (
    messages.length === 0 ||
    messages.some(message => {
      if (
        typeof message.id !== 'string' ||
        message.id.length === 0 ||
        ids.has(message.id)
      ) {
        return true;
      }
      ids.add(message.id);
      return false;
    })
  ) {
    throw new InvalidArgumentError({
      parameter: 'messages',
      value: messages,
      message: 'Compaction requires nonempty history with unique message IDs.',
    });
  }

  await validateCheckpoint(replacementMessages, checkpoint);
  const serializedMessages =
    await serializeCompactionMessages(replacementMessages);
  const lastMessage = messages[messages.length - 1];
  return {
    type: 'compaction',
    version: 1,
    replaces: {
      messageId: lastMessage.id,
      messageCount: messages.length,
      partCount: lastMessage.parts.length,
      digest: await getUIMessageCompactionDigest(messages),
    },
    messages: serializedMessages,
    ...(checkpoint === undefined
      ? {}
      : {
          // Normalizing binary data and legacy files can change the checkpoint
          // representation. Bind the descriptor to its persisted representation.
          checkpoint: await createCheckpoint(
            await deserializeCompactionMessages(serializedMessages),
            checkpoint.startIndex,
            checkpoint.messageCount,
          ),
        }),
  };
}
