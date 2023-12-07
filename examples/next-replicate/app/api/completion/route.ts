import { ReplicateStream, StreamingTextResponse } from 'ai';
import Replicate from 'replicate';

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_KEY || '',
});

export async function POST(req: Request) {
  // Get the prompt from the request body
  const { prompt } = await req.json();

  const response = await replicate.predictions.create({
    // You must enable streaming.
    stream: true,
    // The model must support streaming. See https://replicate.com/docs/streaming
    // This is the model ID for Llama 2 70b Chat
    version: '2c1608e18606fad2812020dc541930f2d0495ce32eee50074220b87300bc16e1',
    // Format the message list into the format expected by Llama 2
    // @see https://github.com/vercel/ai/blob/99cf16edf0a09405d15d3867f997c96a8da869c6/packages/core/prompts/huggingface.ts#L53C1-L78C2
    input: {
      prompt,
    },
  });

  // Convert the response into a friendly text-stream
  const stream = await ReplicateStream(response);
  // Respond with the stream
  return new StreamingTextResponse(stream);
}
