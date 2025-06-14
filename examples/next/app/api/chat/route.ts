import { MyUIMessage } from '@/util/chat-schema';
import { readChat, saveChat } from '@util/chat-store';
import {
  consumeStream,
  convertToModelMessages,
  createUIMessageStreamResponse,
  generateId,
  JsonToSseTransformStream,
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

  const streamId = generateId();

  saveChat({ id, streamId });

  const stream = result.toUIMessageStream({
    originalMessages: messages,
    messageMetadata: ({ part }) => {
      if (part.type === 'start') {
        return { createdAt: Date.now() };
      }
    },
    onFinish: ({ messages }) => {
      saveChat({ id, messages, streamId: null });
    },
  });

  const [stream1, stream2] = stream.tee();

  const streamContext = createResumableStreamContext({
    waitUntil: after,
  });

  const resumableStream = await streamContext.createNewResumableStream(
    streamId,
    () => stream2.pipeThrough(new JsonToSseTransformStream()),
  );

  if (resumableStream) {
    consumeStream({ stream: resumableStream });
  }

  return createUIMessageStreamResponse({
    stream: stream1,
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

  if (!chat.streamId) {
    return new Response('No stream found', { status: 404 });
  }

  // TODO headers
  return new Response(await streamContext.resumeExistingStream(chat.streamId));
}
