import { OpenAI } from '@ai-sdk/openai';
import { experimental_streamText, streamToResponse } from 'ai';
import { NextApiRequest, NextApiResponse } from 'next';

// Create an OpenAI Provider instance
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? '',
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { messages } = await req.body;

  // Ask OpenAI for a streaming chat completion given the prompt
  const result = await experimental_streamText({
    model: openai.chat('gpt-4-turbo-preview'),
    messages,
  });

  // Convert the response into a friendly text-stream
  const stream = result.toAIStream();

  /**
   * Converts the stream to a Node.js Response-like object.
   * Please note that this sends the response as one message once it's done.
   */
  return streamToResponse(stream, res);
}
