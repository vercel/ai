import { MyUIMessage } from '@/util/chat-schema';
import { readChat, saveChat } from '@util/chat-store';
import {
  consumeStream,
  convertToModelMessages,
  generateId,
  streamText,
} from 'ai';
import { after } from 'next/server';
import { createResumableStreamContext } from 'resumable-stream';

export async function POST(req: Request) {
  const { message, id }: { message: MyUIMessage; id: string } =
    await req.json();

  const chat = await readChat(id);
  const messages = [...chat.messages, message];

  const result = streamText({
    model: 'openai/gpt-4o-mini',
    messages: convertToModelMessages(messages),
  });

  const streamContext = createResumableStreamContext({ waitUntil: after });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    messageMetadata: ({ part }) => {
      if (part.type === 'start') {
        return { createdAt: Date.now() };
      }
    },
    onFinish: ({ messages }) => {
      saveChat({ id, messages, activeStreamId: null });
    },
    async consumeSseStream({ stream }) {
      const streamId = generateId();

      // send the sse stream into a resumable stream sink as well:
      const resumableStream = await streamContext.createNewResumableStream(
        streamId,
        () => stream,
      );

      if (resumableStream) {
        // update the chat with the streamId
        saveChat({ id, activeStreamId: streamId });

        // always consume the stream even if the client connection is lost
        consumeStream({ stream: resumableStream });
      }
    },
  });
}

export async function GET(request: Request) {
  const streamContext = createResumableStreamContext({
    waitUntil: after,
  });

  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get('id');

  if (!chatId) {
    return new Response('id is required', { status: 400 });
  }

  const chat = await readChat(chatId);

  if (!chat.activeStreamId) {
    return new Response('No stream found', { status: 404 });
  }

  // TODO headers
  return new Response(
    await streamContext.resumeExistingStream(chat.activeStreamId),
  );
}
