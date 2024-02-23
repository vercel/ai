import { streamText } from 'ai/function';
import { openai } from 'ai/provider';

export const runtime = 'edge';

export async function POST(req: Request) {
  const { prompt } = await req.json();

  const result = await streamText({
    model: openai.chat({
      id: 'gpt-3.5-turbo',
    }),
    prompt,
  });

  return result.toResponse();
}
