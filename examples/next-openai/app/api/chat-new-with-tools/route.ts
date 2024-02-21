import { Tool, streamMessage, zodSchema } from 'ai/function';
import { openai } from 'ai/provider';
import { z } from 'zod';

export const runtime = 'edge';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const stream = await streamMessage({
    model: openai.chat({
      id: 'gpt-4',
    }),

    tools: [
      new Tool({
        name: 'get_city_temperature' as const,
        description: 'Get the current weather',
        parameters: zodSchema(
          z.object({
            city: z
              .string()
              .describe('The city and state, e.g. San Francisco, CA'),
            format: z
              .enum(['celsius', 'fahrenheit'])
              .describe(
                'The temperature unit to use. Infer this from the users location.',
              ),
          }),
        ),
        execute: async ({ city, format }) => ({
          temperature: 20,
          unit: format === 'celsius' ? 'C' : 'F',
        }),
      }),
    ],

    prompt: {
      system:
        'You are a helpful assistant that can provide weather information for a given city.',
      messages,
    },
  });

  return stream.toTextResponse();
}
