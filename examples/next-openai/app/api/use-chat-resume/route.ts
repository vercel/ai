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
  const streamContext = createResumableStreamContext({
    waitUntil: after,
  });

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

  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      const result = streamText({
        model: openai('gpt-4o'),
        messages: convertToModelMessages(messages),
      });

      writer.merge(
        result.toUIMessageStream({
          onFinish: ({ messages }) => {
            saveChat({ chatId, messages });
          },
        }),
      );
    },
  });

  return new Response(
    await streamContext.resumableStream(streamId, () =>
      stream.pipeThrough(new JsonToSseTransformStream()),
    ),
  );
}
