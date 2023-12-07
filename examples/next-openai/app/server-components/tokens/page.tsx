import OpenAI from 'openai';
import { OpenAIStream } from 'ai';
import { Tokens } from 'ai/react';

export const runtime = 'edge';

export default async function Page() {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY ?? '',
  });

  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    stream: true,
    messages: [
      {
        role: 'user',
        content: 'Tell me about San Francisco',
      },
    ],
  });

  // Convert the response into a friendly text-stream using the SDK's wrappers
  const stream = OpenAIStream(response);

  return <Tokens stream={stream} />;
}
