import { callWeatherApi } from '@/util/call-weather-api';
import { MyUIMessage } from '@/util/chat-schema';
import { readChat, saveChat } from '@util/chat-store';
import { convertToModelMessages, streamText, tool } from 'ai';
import z from 'zod/v4';

export async function POST(req: Request) {
  const { message, id }: { message: MyUIMessage; id: string } =
    await req.json();

  const chat = await readChat(id);
  const messages = [...chat.messages, message];

  const result = streamText({
    model: 'openai/gpt-4o',
    messages: convertToModelMessages(messages),
    tools: {
      getWeather: tool({
        description: 'show the weather in a given city to the user',
        parameters: z.object({ city: z.string() }),
        execute: callWeatherApi,
      }),
    },
  });

  result.consumeStream(); // TODO always consume the stream even when the client disconnects

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    messageMetadata: ({ part }) => {
      if (part.type === 'start') {
        return { createdAt: Date.now() };
      }
    },
    onFinish: ({ messages }) => {
      // TODO fix type safety
      saveChat({ id, messages: messages as MyUIMessage[] });
    },
  });
}
