import { OpenAIStream, StreamingTextResponse, streamToResponse } from 'ai';
import { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

// Create an OpenAI API client (that's edge friendly!)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { messages } = await req.body;

  // Ask OpenAI for a streaming chat completion given the prompt
  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    stream: true,
    messages,
  });

  // Convert the response into a friendly text-stream
  const stream = OpenAIStream(response);

  /**
   * Converts the stream to a Node.js Response-like object.
   * Please note that this sends the response as one message once it's done.
   */
  return streamToResponse(stream, res);
}
