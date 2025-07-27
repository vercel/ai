import {
  appendMessageToChat,
  appendStreamId,
  saveChat,
} from '@/util/chat-store';
import { openai } from '@ai-sdk/openai';
import {
  convertToModelMessages,
  createUIMessageStream,
  generateId,
  JsonToSseTransformStream,
  streamText,
  UIMessage,
} from 'ai';
import { after } from 'next/server';
import { createResumableStreamContext } from 'resumable-stream';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { chatId, messages }: { chatId: string; messages: UIMessage[] } =
    await req.json();

  const streamId = generateId();

  const recentUserMessage = messages
    .filter(message => message.role === 'user')
    .at(-1);

  if (!recentUserMessage) {
    throw new Error('No recent user message found');
  }

  await appendMessageToChat({ chatId, message: recentUserMessage });
  await appendStreamId({ chatId, streamId });

  const result = streamText({
    model: openai('gpt-4o'),
    messages: convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onFinish: ({ messages }) => {
      saveChat({ chatId, messages });
    },
    async consumeSseStream({ stream }) {
      // send the sse stream into a resumable stream sink as well:
      const streamContext = createResumableStreamContext({ waitUntil: after });
      await streamContext.createNewResumableStream(streamId, () => stream);
    },
  });
}
