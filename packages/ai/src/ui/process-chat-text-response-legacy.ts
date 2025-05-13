import { JSONValue } from '@ai-sdk/provider';
import { generateId as generateIdFunction } from '@ai-sdk/provider-utils';
import { processTextStream } from './process-text-stream';
import { TextUIPart, UIMessage } from './ui-messages';
import { UseChatOptions } from './use-chat';

export async function processChatTextResponse({
  stream,
  update,
  onFinish,
  getCurrentDate = () => new Date(),
  generateId = generateIdFunction,
}: {
  stream: ReadableStream<Uint8Array>;
  update: (options: {
    message: UIMessage;
    data: JSONValue[] | undefined;
    replaceLastMessage: boolean;
  }) => void;
  onFinish: UseChatOptions['onFinish'];
  getCurrentDate?: () => Date;
  generateId?: () => string;
}) {
  const textPart: TextUIPart = { type: 'text', text: '' };

  const resultMessage: UIMessage = {
    id: generateId(),
    createdAt: getCurrentDate(),
    role: 'assistant' as const,
    parts: [textPart],
  };

  await processTextStream({
    stream,
    onTextPart: chunk => {
      textPart.text += chunk;

      // note: creating a new message object is required for Solid.js streaming
      update({
        message: { ...resultMessage },
        data: [],
        replaceLastMessage: false,
      });
    },
  });

  // in text mode, we don't have usage information or finish reason:
  onFinish?.(resultMessage, {
    usage: {
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: undefined,
    },
    finishReason: 'unknown',
  });
}
