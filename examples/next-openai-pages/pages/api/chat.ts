import { createOpenAI } from '@ai-sdk/openai';
import { StreamingTextResponse, streamText } from 'ai';

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? '',
});

export const runtime = 'edge';

// IMPORTANT: The Next.js Pages Router's API Routes do not support streaming responses.
// see https://sdk.vercel.ai/docs/guides/frameworks/nextjs-pages
export default async function handler(req: Request, res: Response) {
  const { messages } = await req.json();

  const result = await streamText({
    model: openai('gpt-4-turbo-preview'),
    messages,
  });

  return new StreamingTextResponse(result.toAIStream());
}
