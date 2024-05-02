import { StreamingTextResponse, streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

export const dynamic = 'force-dynamic';

const perplexity = createOpenAI({
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
