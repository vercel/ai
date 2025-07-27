import { MyUIMessage } from '@/util/chat-schema';
import { openai } from '@ai-sdk/openai';
import { readChat, saveChat } from '@util/chat-store';
import { convertToModelMessages, generateId, streamText } from 'ai';
import { after } from 'next/server';
import { createResumableStreamContext } from 'resumable-stream';

export async function POST(req: Request) {
  const {
    message,
    id,
    trigger,
    messageId,
  }: {
    message: MyUIMessage | undefined;
    id: string;
    trigger: 'submit-message' | 'regenerate-message';
    messageId: string | undefined;
  } = await req.json();

  const chat = await readChat(id);
  let messages: MyUIMessage[] = chat.messages;

  if (trigger === 'submit-message') {
    if (messageId != null) {
      const messageIndex = messages.findIndex(m => m.id === messageId);

      if (messageIndex === -1) {
        throw new Error(`message ${messageId} not found`);
      }

      messages = messages.slice(0, messageIndex);
      messages.push(message!);
    } else {
      messages = [...messages, message!];
    }
  } else if (trigger === 'regenerate-message') {
    const messageIndex =
      messageId == null
        ? messages.length - 1
        : messages.findIndex(message => message.id === messageId);

    if (messageIndex === -1) {
      throw new Error(`message ${messageId} not found`);
    }

    // set the messages to the message before the assistant message
    messages = messages.slice(
      0,
      messages[messageIndex].role === 'assistant'
        ? messageIndex
        : messageIndex + 1,
    );
  }

  // save the user message
  saveChat({ id, messages, activeStreamId: null });

  const result = streamText({
    model: openai('gpt-4o-mini'),
    messages: convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    generateMessageId: generateId,
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
