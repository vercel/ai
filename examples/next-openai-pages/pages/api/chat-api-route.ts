import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  request: NextApiRequest,
  response: NextApiResponse,
) {
  const { messages } = await request.body;

  const result = streamText({
    model: openai('gpt-4-turbo-preview'),
    messages,
  });

  // write the data stream to the response
  // Note: this is sent as a single response, not a stream
  result.pipeDataStreamToResponse(response);
}
