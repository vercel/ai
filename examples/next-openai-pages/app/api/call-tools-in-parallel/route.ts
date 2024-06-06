import { ToolInvocation, convertToCoreMessages, streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  toolInvocations?: ToolInvocation[];
}

function getWeather({ city, unit }: { city: string; unit: string }) {
  return { value: 25, description: 'Sunny' };
}

export async function POST(req: Request) {
  const { messages }: { messages: Message[] } = await req.json();

  const result = await streamText({
    model: openai('gpt-4o'),
    system: 'You are a helpful assistant.',
    // @ts-ignore
    messages: convertToCoreMessages(messages),
    tools: {
      getWeather: {
        description: 'Get the weather for a location',
        parameters: z.object({
          city: z.string().describe('The city to get the weather for'),
          unit: z
            .enum(['C', 'F'])
            .describe('The unit to display the temperature in'),
        }),
        execute: async ({ city, unit }) => {
          const weather = getWeather({ city, unit });
          return `It is currently 25°${weather.value}°${unit} and ${weather.description} in ${city}!`;
        },
      },
    },
  });

  return result.toAIStreamResponse();
}
