import { IdGenerator } from '@ai-sdk/provider-utils';
import { UIMessage } from '../ui/ui-messages';

export function getResponseUIMessageId({
  originalMessages,
  responseMessageId,
}: {
  originalMessages: UIMessage[] | undefined;
  responseMessageId: string | IdGenerator;
}) {
  // when there are no original messages (i.e. no persistence),
  // the assistant message id generation is handled on the client side.
  if (originalMessages == null) {
    return undefined;
  }

  const lastMessage = originalMessages[originalMessages.length - 1];

  return lastMessage?.role === 'assistant'
    ? lastMessage.id
    : typeof responseMessageId === 'function'
      ? responseMessageId()
      : responseMessageId;
}
