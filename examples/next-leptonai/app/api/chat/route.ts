import OpenAI from 'openai';
import { OpenAIStream, StreamingTextResponse } from 'ai';

// Create an OpenAI API client (that's edge friendly!)
// but configure it to point to Lepton AI llama2-70b
const lepton = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
  baseURL: 'https://llama2-70b.lepton.run/api/v1',
});
// IMPORTANT! Set the runtime to edge
export const runtime = 'edge';
export async function POST(req: Request) {
  // Extract the `messages` from the body of the request
  const { messages } = await req.json();
  
  // Ask Lepton for a streaming chat completion using Llama 2 70b model
  // @see https://www.lepton.ai/playground/llama2?model=llama2-70b
  const response = await lepton.chat.completions.create({
    model: 'llama2-70b',
    stream: true,
    max_tokens: 1000,
    messages,
  });
  // Convert the response into a friendly text-stream.
  const stream = OpenAIStream(response);
  // Respond with the stream
  return new StreamingTextResponse(stream);
}
