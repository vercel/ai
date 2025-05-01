import {
  appendMessageToChat,
  appendStreamId,
  loadStreams,
  saveChat,
} from '@/util/chat-store';
import { openai } from '@ai-sdk/openai';
import {
  appendResponseMessages,
  createDataStream,
  generateId,
  Message,
  streamText,
} from 'ai';
import { after } from 'next/server';
import { createResumableStreamContext } from 'resumable-stream';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const streamContext = createResumableStreamContext({
    waitUntil: after,
  });

  const { id, messages }: { id: string; messages: Message[] } =
    await req.json();

  const streamId = generateId();

  const recentUserMessage = messages
    .filter(message => message.role === 'user')
    .at(-1);

  if (!recentUserMessage) {
    throw new Error('No recent user message found');
  }

  await appendMessageToChat({ chatId: id, message: recentUserMessage });

  await appendStreamId({ chatId: id, streamId });

  const stream = createDataStream({
    execute: dataStream => {
      const result = streamText({
        model: openai('gpt-4o'),
        messages,
        onFinish: async ({ response }) => {
          await saveChat({
            id,
            messages: appendResponseMessages({
              messages,
              responseMessages: response.messages,
            }),
          });
        },
      });

      result.mergeIntoDataStream(dataStream);
    },
  });

  return new Response(
    await streamContext.resumableStream(streamId, () => stream),
  );
}

export async function GET(request: Request) {
  const streamContext = createResumableStreamContext({
    waitUntil: after,
  });

  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get('chatId');

  if (!chatId) {
    return new Response('id is required', { status: 400 });
  }

  const streamIds = await loadStreams(chatId);

  if (!streamIds.length) {
    return new Response('No streams found', { status: 404 });
  }

  const recentStreamId = streamIds.at(-1);

  if (!recentStreamId) {
    return new Response('No recent stream found', { status: 404 });
  }

  const emptyDataStream = createDataStream({
    execute: () => {},
  });

  return new Response(
    await streamContext.resumableStream(recentStreamId, () => emptyDataStream),
  );
}
