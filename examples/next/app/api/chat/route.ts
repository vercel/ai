import { MyUIMessage } from '@/util/chat-schema';
import { loadStreams, readChat, saveChat } from '@util/chat-store';
import {
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

  const stream = result.toUIMessageStream({
    originalMessages: messages,
    messageMetadata: ({ part }) => {
      if (part.type === 'start') {
        return { createdAt: Date.now() };
      }
    },
    onFinish: ({ messages }) => {
      saveChat({ id, messages });
    },
  });

  const [stream1, stream2] = stream.tee();

  const streamId = generateId();

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

export async function consumeStream({
  stream,
  onError,
}: {
  stream: ReadableStream;
  onError?: (error: unknown) => void;
}): Promise<void> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }
  } catch (error) {
    onError?.(error);
  } finally {
    reader.releaseLock();
  }
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

  // TODO headers
  return new Response(await streamContext.resumeExistingStream(recentStreamId));
}
