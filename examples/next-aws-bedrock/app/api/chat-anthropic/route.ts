import {
  BedrockRuntimeClient,
  InvokeModelWithResponseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { AWSBedrockAnthropicStream, StreamingTextResponse } from 'ai';

// IMPORTANT! Set the runtime to edge
export const runtime = 'edge';

// Claude has an interesting way of dealing with prompts, so we use a helper function to build one from our request
// Prompt formatting is discussed briefly at https://docs.anthropic.com/claude/reference/getting-started-with-the-api
function buildPrompt(
  messages: { content: string; role: 'system' | 'user' | 'assistant' }[],
) {
  return (
    messages.map(({ content, role }) => {
      if (role === 'user') {
        return `\n\nHuman: ${content}`;
      } else {
        return `\n\nAssistant: ${content}`;
      }
    }) + '\n\nAssistant:'
  );
}

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
      modelId: 'anthropic.claude-v2',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        prompt: buildPrompt(messages),
        max_tokens_to_sample: 300,
      }),
    }),
  );

  // Convert the response into a friendly text-stream
  const stream = AWSBedrockAnthropicStream(bedrockResponse);

  // Respond with the stream
  return new StreamingTextResponse(stream);
}
