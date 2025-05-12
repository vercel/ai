import { generateId as generateIdFunction } from '@ai-sdk/provider-utils';
import { processTextStream } from './process-text-stream';
import { TextUIPart, UIMessage } from './ui-messages';
import { UseChatOptions } from './use-chat';

export async function processChatTextResponse<MESSAGE_METADATA = unknown>({
  stream,
  update,
  onFinish,
  generateId = generateIdFunction,
}: {
  stream: ReadableStream<Uint8Array>;
  update: (options: { message: UIMessage<MESSAGE_METADATA> }) => void;
  onFinish: UseChatOptions<MESSAGE_METADATA>['onFinish'];
  generateId?: () => string;
}) {
  const textPart: TextUIPart = { type: 'text', text: '' };

  const resultMessage: UIMessage<MESSAGE_METADATA> = {
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
