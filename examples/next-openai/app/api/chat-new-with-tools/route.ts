import { streamText, tool } from 'ai/core';
import { openai } from 'ai/provider';
import { z } from 'zod';

export const runtime = 'edge';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const stream = await streamText({
    model: openai.chat({ id: 'gpt-4' }),

    tools: {
      get_city_temperature: tool({
        description: 'Get the current weather',

        parameters: z.object({
          city: z
            .string()
            .describe('The city and state, e.g. San Francisco, CA'),
          format: z
            .enum(['celsius', 'fahrenheit'])
            .describe(
              'The temperature unit to use. Infer this from the users location.',
            ),
        }),

        execute: async ({ city, format }) => ({
          city,
          temperature: 20,
          unit: format === 'celsius' ? 'C' : 'F',
        }),
      }),
    },

    prompt: {
      system:
        'You are a helpful assistant that can provide weather information for a given city.',
      messages,
    },
  });

  return stream.toResponse();
}
