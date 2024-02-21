import { streamMessage, zodSchema } from 'ai/function';
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
      {
        name: 'get_city_temperature',
        parameters: zodSchema(z.object({ city: z.string() })),
      },
    ],

    prompt: {
      system:
        'You are a helpful assistant that can provide weather information for a given city.',
      messages,
    },
  });

  return stream.toTextResponse();
}
