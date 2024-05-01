import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';

export const dynamic = 'force-dynamic';

const groq = createOpenAI({
  apiKey: process.env.GROQ_API_KEY ?? '',
  baseURL: 'https://api.groq.com/openai/v1',
});

export async function POST(req: Request) {
  // Extract the `messages` from the body of the request
  const { messages } = await req.json();

  // Call the language model
  const result = await streamText({
    model: groq.chat('llama3-70b-8192'),
    messages,
  });

  // Respond with the stream
  return result.toAIStreamResponse();
}
