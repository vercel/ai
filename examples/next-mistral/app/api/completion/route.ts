import MistralClient from '@mistralai/mistralai';
import { MistralStream, StreamingTextResponse, StreamData } from 'ai';

const mistral = new MistralClient(process.env.MISTRAL_API_KEY || '');

export const runtime = 'edge';

export async function POST(req: Request) {
  // Extract the `prompt` from the body of the request
  const { prompt } = await req.json();

  // Ask Mistral for a streaming completion given the prompt
  const response = mistral.chatStream({
    model: 'mistral-small',
    maxTokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  });

  // optional: use stream data
  const data = new StreamData();

  data.append({ test: 'value' });

  // Convert the response into a friendly text-stream
  const stream = MistralStream(response, {
    onFinal(completion) {
      data.close();
    },
  });

  // Respond with the stream
  return new StreamingTextResponse(stream, {}, data);
}
