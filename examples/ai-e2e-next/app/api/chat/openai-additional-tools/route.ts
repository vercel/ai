import { openaiAdditionalToolsAgent } from '@/agent/openai/additional-tools-agent';
import { createAgentUIStreamResponse } from 'ai';

export async function POST(req: Request) {
  const { messages } = await req.json();

  return createAgentUIStreamResponse({
    agent: openaiAdditionalToolsAgent,
    uiMessages: messages,
  });
}
