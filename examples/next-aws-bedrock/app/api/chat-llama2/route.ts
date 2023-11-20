import {
  BedrockRuntimeClient,
  InvokeModelWithResponseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { AWSBedrockLlama2Stream, StreamingTextResponse } from 'ai';
import { experimental_buildLlama2Prompt } from 'ai/prompts';

// IMPORTANT! Set the runtime to edge
export const runtime = 'edge';

export async function POST(req: Request) {
  // Extract the `prompt` from the body of the request
  const { messages } = await req.json();

  const bedrockClient = new BedrockRuntimeClient({
    region: process.env.AWS_REGION ?? '',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
    },
  });

  // Ask Claude for a streaming chat completion given the prompt
  const bedrockResponse = await bedrockClient.send(
    new InvokeModelWithResponseStreamCommand({
      modelId: 'meta.llama2-13b-chat-v1',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        prompt: experimental_buildLlama2Prompt(messages),
        max_gen_len: 300,
      }),
    }),
  );

  // Convert the response into a friendly text-stream
  const stream = AWSBedrockLlama2Stream(bedrockResponse);

  // Respond with the stream
  return new StreamingTextResponse(stream);
}
