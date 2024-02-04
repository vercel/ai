import OpenAI from 'openai';
import { OpenAIStream, StreamingTextResponse } from 'ai';

// Create an OpenAI API client (that's edge friendly!)
// but configure it to point to perplexity.ai
const perplexity = new OpenAI({
  apiKey: process.env.PERPLEXITY_API_KEY || '',
  baseURL: 'https://api.perplexity.ai/',
});

// IMPORTANT! Set the runtime to edge
export const runtime = 'edge';

export async function POST(req: Request) {
  // Extract the `messages` from the body of the request
  const { messages } = await req.json();

  // Ask Perplexity for a streaming chat completion using PPLX 70B online model
  // @see https://blog.perplexity.ai/blog/introducing-pplx-online-llms
  const response = await perplexity.chat.completions.create({
    model: 'pplx-70b-online',
    stream: true,
    max_tokens: 1000,
    messages,
  });

  // Convert the response into a friendly text-stream.
  const stream = OpenAIStream(response);

  // Respond with the stream
  return new StreamingTextResponse(stream);
}
