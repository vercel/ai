// @ts-nocheck
import { streamText } from 'ai';

async function handler(req, res) {
  const stream = await streamText({
    model: 'gpt-4',
    prompt: 'Hello'
  });

  const aiStream = stream.toAIStream();
  stream.pipeAIStreamToResponse(res);
  return stream.toAIStreamResponse();
}
