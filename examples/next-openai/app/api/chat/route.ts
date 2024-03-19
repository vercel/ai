import { StreamingTextResponse } from 'ai';
import { streamText } from 'ai/core';
import { openai } from 'ai/openai';

export const runtime = 'edge';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = await streamText({
    model: openai.chat('gpt-4-turbo-preview'),
    messages,
  });

  return new StreamingTextResponse(result.toAIStream());
}
