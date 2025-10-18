import { createAgentStreamResponse } from 'ai';
import { openaiImageGenerationAgent } from '@/agent/openai-image-generation-agent';

export async function POST(req: Request) {
  const { messages } = await req.json();

  return createAgentStreamResponse({
    agent: openaiImageGenerationAgent,
    messages,
  });
}
