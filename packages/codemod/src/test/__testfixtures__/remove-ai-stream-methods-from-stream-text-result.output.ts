// @ts-nocheck
import { streamText } from 'ai';

async function handler(req, res) {
  const stream = await streamText({
    model: 'gpt-4',
    prompt: 'Hello'
  });

  const /* WARNING: toAIStream has been removed from streamText.
   See migration guide at https://sdk.vercel.ai/docs/migrations */
  aiStream = stream.toAIStream();
  /* WARNING: pipeAIStreamToResponse has been removed from streamText.
   See migration guide at https://sdk.vercel.ai/docs/migrations */
  stream.pipeAIStreamToResponse(res);
  /* WARNING: toAIStreamResponse has been removed from streamText.
   See migration guide at https://sdk.vercel.ai/docs/migrations */
  return stream.toAIStreamResponse();
}
