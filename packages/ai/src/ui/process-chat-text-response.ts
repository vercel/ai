import { JSONValue } from '@ai-sdk/provider';
import { ChatStore } from './chat-store';
import { processTextStream } from './process-text-stream';
import { UseChatOptions } from './use-chat';

export async function processChatTextResponse({
  stream,
  updateData,
  onFinish,
  store,
  chatId,
}: {
  stream: ReadableStream<Uint8Array>;
  updateData: (data?: JSONValue[]) => void;
  onFinish: UseChatOptions['onFinish'];
  store: ChatStore;
  chatId: string;
}) {
  store.setStatus({
    id: chatId,
    status: 'streaming',
  });

  // Initialize empty assistant response in case no text chunks are received:
  store.addOrUpdateAssistantMessageParts({
    chatId,
    partDelta: { type: 'text', text: '' },
  });

  await processTextStream({
    stream,
    onTextPart: async chunk => {
      await store.addOrUpdateAssistantMessageParts({
        chatId,
        partDelta: { type: 'text', text: chunk },
      });
    },
  });

  // In text mode, we don't have usage information or finish reason:
  const lastMessage = store.getLastMessage(chatId);

  if (lastMessage && 'revisionId' in lastMessage) {
    delete lastMessage.revisionId;
  }

  onFinish?.(lastMessage!, {
    usage: {
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: undefined,
    },
    finishReason: 'unknown',
  });
}
