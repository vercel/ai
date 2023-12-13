import { OpenAIStream, StreamingTextResponse } from 'ai';

// Note: There are no types for the Mistral API client yet.
// @ts-ignore
import MistralClient from '@mistralai/mistralai';

export async function POST(req: Request) {
  // Extract the `messages` from the body of the request
  const { messages } = await req.json();

  const client = new MistralClient(process.env.MISTRAL_API_KEY || '');

  const response = await client.chatStream({
    model: 'mistral-tiny',
    stream: true,
    max_tokens: 1000,
    messages,
  });

  // Convert the response into a friendly text-stream. The Mistral client responses are
  // compatible with the Vercel AI SDK OpenAIStream adapter.
  const stream = OpenAIStream(response);

  // Respond with the stream
  return new StreamingTextResponse(stream);
}
