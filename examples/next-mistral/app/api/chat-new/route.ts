import { streamMessage } from 'ai';
import { mistral } from 'ai/provider';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const messageStream = await streamMessage({
    model: mistral.chat({
      modelId: 'mistral-tiny',
    }),
    maxTokens: 1000,
    prompt: messages,
  });

  return messageStream.toResponse();
}
