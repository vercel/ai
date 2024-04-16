import { OpenAI } from '@ai-sdk/openai';
import { StreamingTextResponse, experimental_streamText } from 'ai';

export const runtime = 'edge';

const fireworks = new OpenAI({
  apiKey: process.env.FIREWORKS_API_KEY ?? '',
  baseURL: 'https://api.fireworks.ai/inference/v1',
});

export async function POST(req: Request) {
  try {
    // Extract the `messages` from the body of the request
    const { messages } = await req.json();

    // Call the language model
    const result = await experimental_streamText({
      model: fireworks.completion(
        'accounts/fireworks/models/llama-v2-70b-chat',
      ),
      messages,
    });

    // Respond with the stream
    return new StreamingTextResponse(result.toAIStream());
  } catch (error) {
    console.log(error);
    throw error;
  }
}
