import { MyUIMessage } from '@/util/chat-schema';
import { readChat, saveChat } from '@util/chat-store';
import { convertToModelMessages, generateId, streamText } from 'ai';
import { after } from 'next/server';
import { createResumableStreamContext } from 'resumable-stream';

export async function POST(req: Request) {
  const { message, id }: { message: MyUIMessage; id: string } =
    await req.json();

  const chat = await readChat(id);
  const messages = [...chat.messages, message];

  // save the user message
  saveChat({ id, messages, activeStreamId: null });

  const result = streamText({
    model: 'openai/gpt-4o-mini',
    messages: convertToModelMessages(messages),
  });

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
      const streamContext = createResumableStreamContext({ waitUntil: after });
      await streamContext.createNewResumableStream(streamId, () => stream);

      // update the chat with the streamId
      saveChat({ id, activeStreamId: streamId });
    },
  });
}
