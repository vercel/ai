import { streamMessage } from 'ai/function';
import { openai } from 'ai/provider';

export const runtime = 'edge';

export async function POST(req: Request) {
  const { prompt } = await req.json();

  const stream = await streamMessage({
    model: openai.chat({
      modelId: 'gpt-3.5-turbo',
    }),
    prompt,
  });

  return stream.toStreamingTextResponse();
}
