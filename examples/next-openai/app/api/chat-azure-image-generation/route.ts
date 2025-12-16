import { createAgentUIStreamResponse } from 'ai';
import { createAzureImageGenerationAgent } from '@/agent/azure-image-generation-agent';

export async function POST(req: Request) {
  const body = await req.json();

  const agent = createAzureImageGenerationAgent('gpt-4.1-mini');

  return createAgentUIStreamResponse({
    agent,
    uiMessages: body.messages,
  });
}
