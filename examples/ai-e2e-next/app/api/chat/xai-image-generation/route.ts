import { createAgentUIStreamResponse } from 'ai';
import { xaiImageGenerationAgent } from '@/agent/xai/image-generation-agent';

export async function POST(req: Request) {
  const body = await req.json();

  return createAgentUIStreamResponse({
    agent: xaiImageGenerationAgent,
    uiMessages: body.messages,
  });
}
