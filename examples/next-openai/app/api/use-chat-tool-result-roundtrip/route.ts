import { openai } from '@ai-sdk/openai';
import { convertToCoreMessages, streamText } from 'ai';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const { messages } = await req.json();

  console.log('messages:', JSON.stringify(messages, null, 2));

  const result = await streamText({
    model: openai('gpt-4-turbo'),
    system:
      'You are a weather bot that can use the weather tool to get the weather in a given city. ' +
      'Respond to the user with weather information in a friendly and helpful manner.',
    messages: convertToCoreMessages(messages),
    tools: {
      weather: {
        description: 'show the weather in a given city to the user',
        parameters: z.object({ city: z.string() }),
        execute: async ({}: { city: string }) => {
          // Random delay between 1000ms (1s) and 3000ms (3s):
          const delay = Math.floor(Math.random() * (3000 - 1000 + 1)) + 1000;
          await new Promise(resolve => setTimeout(resolve, delay));

          // Random weather:
          const weatherOptions = ['sunny', 'cloudy', 'rainy', 'snowy', 'windy'];
          return weatherOptions[
            Math.floor(Math.random() * weatherOptions.length)
          ];
        },
      },
    },
  });

  return result.toAIStreamResponse();
}
