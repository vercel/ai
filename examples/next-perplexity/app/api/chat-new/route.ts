import { streamMessage } from 'ai/function';
import { perplexity } from 'ai/provider';

export const runtime = 'edge';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const stream = await streamMessage({
    model: perplexity.chat({
      id: 'pplx-70b-online',
      maxTokens: 1000,
    }),
    prompt: { messages },
  });

  return stream.toTextResponse();
}
