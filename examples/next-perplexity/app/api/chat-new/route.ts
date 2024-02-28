import { streamText } from 'ai/core';
import { perplexity } from 'ai/provider';

export const runtime = 'edge';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const stream = await streamText({
    model: perplexity.chat({ id: 'pplx-70b-online', maxTokens: 1000 }),
    prompt: { messages },
  });

  return stream.toResponse();
}
