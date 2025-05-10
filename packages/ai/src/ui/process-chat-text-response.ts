import { generateId as generateIdFunction } from '@ai-sdk/provider-utils';
import { processTextStream } from './process-text-stream';
import { TextUIPart, UIMessage } from './ui-messages';
import { UseChatOptions } from './use-chat';

export async function processChatTextResponse({
  stream,
  update,
  onFinish,
  generateId = generateIdFunction,
}: {
  stream: ReadableStream<Uint8Array>;
  update: (options: { message: UIMessage }) => void;
  onFinish: UseChatOptions['onFinish'];
  generateId?: () => string;
}) {
  const textPart: TextUIPart = { type: 'text', text: '' };

  const resultMessage: UIMessage = {
    id: generateId(),
    role: 'assistant' as const,
    parts: [textPart],
  };

  await processTextStream({
    stream,
    onTextPart: chunk => {
      textPart.text += chunk;

      // note: creating a new message object is required for Solid.js streaming
      update({ message: { ...resultMessage } });
    },
  });

  // in text mode, we don't have usage information or finish reason:
  onFinish?.({ message: resultMessage });
}
