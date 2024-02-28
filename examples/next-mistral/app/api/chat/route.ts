import { streamText } from 'ai/core';
import { mistral } from 'ai/provider';

export const runtime = 'edge';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const stream = await streamText({
    model: mistral.chat({ id: 'mistral-small', maxTokens: 1000 }),
    prompt: { messages },
  });

  return stream.toResponse();
}
