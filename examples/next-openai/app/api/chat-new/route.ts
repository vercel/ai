import { streamText } from 'ai/core';
import { openai } from 'ai/provider';

export const runtime = 'edge';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const stream = await streamText({
    model: openai.chat({ id: 'gpt-3.5-turbo' }),
    prompt: { messages },
  });

  return stream.toResponse();
}
