import { createOpenAI } from '@ai-sdk/openai';
import { experimental_streamText } from 'ai';
import { NextApiRequest, NextApiResponse } from 'next';

// Create an OpenAI Provider instance
const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? '',
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { messages } = await req.body;

  // Ask OpenAI for a streaming chat completion given the prompt
  const result = await experimental_streamText({
    model: openai('gpt-4-turbo-preview'),
    messages,
  });

  // write the AI stream to the response
  // Note: this is sent as a single response, not a stream
  result.pipeAIStreamToServerResponse(res);
}
