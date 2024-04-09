import {
  BedrockRuntimeClient,
  InvokeModelWithResponseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { AWSBedrockCohereStream, StreamingTextResponse } from 'ai';

// IMPORTANT! Set the runtime to edge
export const runtime = 'edge';

function buildPrompt(
  messages: { content: string; role: 'system' | 'user' | 'assistant' }[],
) {
  return (
    messages.map(({ content, role }) => {
      if (role === 'user') {
        return `Human: ${content}\n`;
      } else {
        return `Assistant: ${content}\n`;
      }
    }) + 'Assistant:\n'
  );
}

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
  },
});

export async function POST(req: Request) {
  // Extract the `prompt` from the body of the request
  const { messages } = await req.json();

  // Ask Claude for a streaming chat completion given the prompt
  const bedrockResponse = await bedrockClient.send(
    new InvokeModelWithResponseStreamCommand({
      modelId: 'cohere.command-light-text-v14',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        prompt: buildPrompt(messages),
        stream: true,
        max_tokens: 300,
      }),
    }),
  );

  // Convert the response into a friendly text-stream
  const stream = AWSBedrockCohereStream(bedrockResponse);

  // Respond with the stream
  return new StreamingTextResponse(stream);
}
