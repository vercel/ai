import { openai } from '@ai-sdk/openai';
import { StreamingTextResponse, experimental_streamText } from 'ai';

export const runtime = 'edge';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = await experimental_streamText({
    model: openai.chat('gpt-4-turbo-preview'),
    messages,
  });

  return new StreamingTextResponse(result.toAIStream());
}
