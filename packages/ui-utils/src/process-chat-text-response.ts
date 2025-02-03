import { JSONValue } from '@ai-sdk/provider';
import { generateId as generateIdFunction } from '@ai-sdk/provider-utils';
import { processTextStream } from './process-text-stream';
import { TextUIPart, UIMessage, UseChatOptions } from './types';

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
    content: '',
    parts: [textPart],
  };

  await processTextStream({
    stream,
    onTextPart: chunk => {
      resultMessage.content += chunk;
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
    usage: { completionTokens: NaN, promptTokens: NaN, totalTokens: NaN },
    finishReason: 'unknown',
  });
}
