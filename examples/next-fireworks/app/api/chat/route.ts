import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';

export const dynamic = 'force-dynamic';

const fireworks = createOpenAI({
  apiKey: process.env.FIREWORKS_API_KEY ?? '',
  baseURL: 'https://api.fireworks.ai/inference/v1',
});

export async function POST(req: Request) {
  try {
    // Extract the `messages` from the body of the request
    const { messages } = await req.json();

    // Call the language model
    const result = await streamText({
      // Use completion API:
      model: fireworks.completion(
        'accounts/fireworks/models/llama-v2-70b-chat',
      ),
      messages,
    });

    // Respond with the stream
    return result.toAIStreamResponse();
  } catch (error) {
    console.log(error);
    throw error;
  }
}
