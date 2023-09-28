import type { ActionFunctionArgs } from '@vercel/remix';
import { OpenAIStream, StreamingTextResponse } from 'ai';
import OpenAI from 'openai';

// IMPORTANT! Set the runtime to edge when deployed to vercel
export const config = { runtime: 'edge' };

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function action({ request }: ActionFunctionArgs) {
  const { messages } = await request.json();
  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    stream: true,
    messages,
  });

  // Convert the response into a friendly text-stream
  const stream = OpenAIStream(response);
  // Respond with the stream
  return new StreamingTextResponse(stream);
}
