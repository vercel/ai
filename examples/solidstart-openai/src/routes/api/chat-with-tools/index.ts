import {
  StreamingTextResponse,
  streamText,
  convertToCoreMessages,
  tool,
} from 'ai';
import { APIEvent } from '@solidjs/start/server';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

export const POST = async (event: APIEvent) => {
  const { messages } = await event.request.json();

  const result = await streamText({
    model: openai('gpt-3.5-turbo'),
    messages: convertToCoreMessages(messages),
    tools: {
      weather: tool({
        parameters: z.object({
          city: z.string(),
        }),
        description: 'Get the current weather in a city',
        execute: async ({ city }) => {
          // Add your tool logic here
          // Here's a dummy response:
          return '75 degrees, sunny';
        },
      }),
    },
  });

  return new StreamingTextResponse(result.toAIStream());
};
