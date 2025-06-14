import { MyUIMessage } from '@/util/chat-schema';
import { readChat, saveChat } from '@util/chat-store';
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

  const resumableStream = await streamContext.resumableStream(streamId, () =>
    stream2.pipeThrough(new JsonToSseTransformStream()),
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
