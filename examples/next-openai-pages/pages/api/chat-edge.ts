import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';

export const runtime = 'edge';

// Create an OpenAI Provider instance
const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? '',
});

export default async function handler(req: Request) {
  const { messages } = await req.json();

  // Ask OpenAI for a streaming chat completion given the prompt
  const result = await streamText({
    model: openai('gpt-4-turbo-preview'),
    messages,
  });

  // Edge environment: return the AI stream as a single response
  return result.toAIStreamResponse();
}
