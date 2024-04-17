import { OpenAI } from '@ai-sdk/openai';
import { StreamingTextResponse, streamText } from 'ai';

export const runtime = 'edge';

const perplexity = new OpenAI({
  apiKey: process.env.PERPLEXITY_API_KEY ?? '',
  baseURL: 'https://api.perplexity.ai/',
});

export async function POST(req: Request) {
  try {
    // Extract the `messages` from the body of the request
    const { messages } = await req.json();

    // Call the language model
    const result = await streamText({
      // see https://docs.perplexity.ai/docs/model-cards for models
      model: perplexity.chat('sonar-medium-chat'),
      messages,
    });

    // Respond with the stream
    return new StreamingTextResponse(result.toAIStream());
  } catch (error) {
    console.log(error);
    throw error;
  }
}
